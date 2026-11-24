"""Supabase storage and database integration service.

Provides persistence for:
1. Document files in Supabase Storage (bucket: 'documents').
2. Document metadata in Supabase PostgreSQL ('documents' / 'uploaded_documents' table).
3. Search audit history in Supabase PostgreSQL ('search_history' table).

Falls back gracefully to local SQLite and disk storage when Supabase
environment variables are not configured.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional


class SupabaseService:
    def __init__(self) -> None:
        self.url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
        # Service role key should only be used on the backend; never exposed to client
        self.api_key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
            or ""
        )
        self.bucket = os.getenv("SUPABASE_STORAGE_BUCKET") or "documents"

    @property
    def is_configured(self) -> bool:
        """Returns True if Supabase URL and API key are present in environment."""
        return bool(self.url and self.api_key)

    def _headers(self, content_type: str = "application/json") -> Dict[str, str]:
        return {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": content_type,
            "Prefer": "return=representation",
        }

    # --- Storage Operations ---

    @staticmethod
    def _storage_content_type(file_name: str, content_type: Optional[str] = None) -> str:
        """Return a MIME type allowed by the configured documents bucket.

        Never forward application/octet-stream from browsers or multipart uploads.
        """
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        allowed_by_extension = {
            "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "py": "text/x-python",
            "java": "text/x-java-source",
            "js": "application/javascript",
            "jsx": "application/javascript",
            "txt": "text/plain",
            "ts": "text/plain",
            "tsx": "text/plain",
            "c": "text/plain",
            "cpp": "text/plain",
            "h": "text/plain",
            "cs": "text/plain",
            "go": "text/plain",
            "rs": "text/plain",
            "php": "text/plain",
            "rb": "text/plain",
            "sql": "text/plain",
            "html": "text/plain",
            "css": "text/plain",
            "sh": "text/plain",
        }
        inferred = allowed_by_extension.get(ext, "text/plain")
        if not content_type or content_type == "application/octet-stream":
            return inferred
        # Keep the extension-derived value authoritative so Storage allowlist
        # behavior is consistent regardless of client/browser MIME detection.
        return inferred

    def upload_file_to_storage(
        self, file_name: str, file_bytes: bytes, content_type: Optional[str] = None
    ) -> Optional[str]:
        """Upload a file to Supabase Storage bucket. Returns storage path if successful."""
        if not self.is_configured:
            return None

        content_type = self._storage_content_type(file_name, content_type)

        # Sanitize filename for storage path
        safe_name = urllib.parse.quote(file_name)
        endpoint = f"{self.url}/storage/v1/object/{self.bucket}/{safe_name}"

        req = urllib.request.Request(
            endpoint,
            data=file_bytes,
            headers={
                "apikey": self.api_key,
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status in (200, 201):
                    return f"{self.bucket}/{file_name}"
        except Exception as e:
            # Fall back without crashing if bucket doesn't exist or permissions error
            print(f"Supabase storage upload warning for '{file_name}': {e}")
            return None
        return None

    def delete_file_from_storage(self, file_name: str) -> bool:
        """Delete a file from Supabase Storage bucket."""
        if not self.is_configured:
            return False

        safe_name = urllib.parse.quote(file_name)
        endpoint = f"{self.url}/storage/v1/object/{self.bucket}/{safe_name}"
        req = urllib.request.Request(endpoint, headers=self._headers(), method="DELETE")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 204)
        except Exception as e:
            print(f"Supabase storage delete warning: {e}")
            return False

    # --- Database Operations (PostgREST) ---

    def record_document(self, doc: Dict[str, Any]) -> bool:
        """Insert or upsert document metadata into Supabase PostgreSQL."""
        if not self.is_configured:
            return False

        endpoint = f"{self.url}/rest/v1/uploaded_documents"
        payload = json.dumps(doc).encode("utf-8")
        headers = self._headers()
        headers["Resolution"] = "merge-duplicates"

        req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 201)
        except Exception as e:
            print(f"Supabase insert document warning: {e}")
            return False

    def list_documents(self) -> Optional[List[Dict[str, Any]]]:
        """Fetch indexed documents from Supabase PostgreSQL."""
        if not self.is_configured:
            return None

        endpoint = f"{self.url}/rest/v1/uploaded_documents?select=*&order=created_at.desc"
        req = urllib.request.Request(endpoint, headers=self._headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data if isinstance(data, list) else None
        except Exception as e:
            print(f"Supabase list documents warning: {e}")
            return None
        return None

    def delete_document(self, doc_id: str) -> bool:
        """Delete document record from Supabase PostgreSQL."""
        if not self.is_configured:
            return False

        endpoint = f"{self.url}/rest/v1/uploaded_documents?id=eq.{urllib.parse.quote(doc_id)}"
        req = urllib.request.Request(endpoint, headers=self._headers(), method="DELETE")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 204)
        except Exception as e:
            print(f"Supabase delete document warning: {e}")
            return False

    def record_search_history(self, entry: Dict[str, Any]) -> bool:
        """Insert a search history entry into Supabase PostgreSQL."""
        if not self.is_configured:
            return False

        endpoint = f"{self.url}/rest/v1/search_history"
        payload = json.dumps(entry).encode("utf-8")
        req = urllib.request.Request(endpoint, data=payload, headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 201)
        except Exception as e:
            print(f"Supabase record history warning: {e}")
            return False

    def list_search_history(self, limit: int = 50) -> Optional[List[Dict[str, Any]]]:
        """Fetch search history from Supabase PostgreSQL."""
        if not self.is_configured:
            return None

        endpoint = f"{self.url}/rest/v1/search_history?select=*&order=created_at.desc&limit={limit}"
        req = urllib.request.Request(endpoint, headers=self._headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data if isinstance(data, list) else None
        except Exception as e:
            print(f"Supabase list history warning: {e}")
            return None
        return None

    def clear_search_history(self) -> bool:
        """Clear all search history from Supabase PostgreSQL."""
        if not self.is_configured:
            return False

        # In PostgREST, delete all rows where id is not empty
        endpoint = f"{self.url}/rest/v1/search_history?id=neq."
        req = urllib.request.Request(endpoint, headers=self._headers(), method="DELETE")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 204)
        except Exception as e:
            print(f"Supabase clear history warning: {e}")
            return False

    # --- Health & Diagnostic ---

    def test_connection(self) -> Dict[str, Any]:
        """Diagnostic check of Supabase reachability."""
        if not self.is_configured:
            return {
                "configured": False,
                "status": "unconfigured",
                "message": "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set in the environment.",
            }

        endpoint = f"{self.url}/rest/v1/"
        req = urllib.request.Request(endpoint, headers=self._headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return {
                    "configured": True,
                    "status": "connected",
                    "http_code": resp.status,
                    "url": self.url,
                    "bucket": self.bucket,
                }
        except Exception as e:
            return {
                "configured": True,
                "status": "error",
                "error": str(e),
                "url": self.url,
            }


# Global singleton instance
supabase_service = SupabaseService()
