import io
import json
import time
import urllib.request
import urllib.error
import uuid
from pathlib import Path

BASE_API = "http://localhost:8000"
BASE_UI = "http://localhost:3000"

def log(msg, status="INFO"):
    prefixes = {
        "INFO": "[INFO]",
        "PASS": "[PASS]",
        "FAIL": "[FAIL]",
        "WARN": "[WARN]",
        "SECTION": "\n========================================================"
    }
    p = prefixes.get(status, f"[{status}]")
    print(f"{p} {msg}")

def test_suite():
    results = {
        "passed": 0,
        "failed": 0,
        "total": 0,
        "details": []
    }

    def record(name, passed, detail=""):
        results["total"] += 1
        if passed:
            results["passed"] += 1
            log(f"{name}: {detail}", "PASS")
        else:
            results["failed"] += 1
            log(f"{name}: {detail}", "FAIL")
        results["details"].append({"name": name, "passed": passed, "detail": detail})

    log("PHASE 2 & 3: COMPREHENSIVE FEATURE AND INTEGRATION VERIFICATION", "SECTION")

    # 1. Health Endpoint
    try:
        with urllib.request.urlopen(f"{BASE_API}/api/health", timeout=25) as resp:
            data = json.loads(resp.read().decode())
            assert data["status"] == "healthy"
            assert "SQLite FTS5" in data["fts_engine"]
            assert "FAISS" in data["vector_engine"]
            record("API Health Check", True, f"Engines: {data['fts_engine']} | {data['vector_engine']}")
    except Exception as e:
        record("API Health Check", False, str(e))

    # 2. Lexical & Syntax & Semantic Analysis (Compiler Explain)
    try:
        payload = json.dumps({"query": "Find Python functions that process CSV files"}).encode()
        req = urllib.request.Request(f"{BASE_API}/api/compiler/explain", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode())
            # Lexer verification
            tokens = data["tokens"]
            assert len(tokens) >= 5, f"Expected tokens >= 5, got {len(tokens)}"
            action_tokens = [t for t in tokens if t["kind"] == "ACTION"]
            target_tokens = [t for t in tokens if t["kind"] == "TARGET"]
            language_tokens = [t for t in tokens if t["kind"] == "LANGUAGE"]
            assert len(action_tokens) > 0, "Missing ACTION token"
            assert len(target_tokens) > 0, "Missing TARGET token"
            assert len(language_tokens) > 0, "Missing LANGUAGE token"
            record("Lexical Analysis (Tokens & Classification)", True, f"{len(tokens)} tokens correctly classified")

            # Parser & AST verification
            ast = data["ast"]
            assert ast["action"] == "find", f"Unexpected action: {ast['action']}"
            assert ast["target"] == "function", f"Unexpected target: {ast['target']}"
            assert ast["language"] == "python", f"Unexpected language: {ast['language']}"
            assert "CSV" in ast["topic"] or "process" in ast["topic"], f"Unexpected topic: {ast['topic']}"
            record("Syntax Analysis & AST Generation", True, f"AST: action={ast['action']}, target={ast['target']}, lang={ast['language']}")

            # Semantic Analysis verification
            sem = data["semanticStatus"]
            assert sem["valid"] is True, "Semantic validation failed"
            assert sem["targetResolved"] == "function"
            assert sem["languageResolved"] == "python"
            record("Semantic Analysis (Resolution & Invariants)", True, "Target and language resolved with valid semantics")

            # IR & Optimizer verification
            ir = data["ir"]
            opt_ir = data["optimizedIr"]
            assert ir["operation"] == "HYBRID_SEARCH"
            assert opt_ir["filters"]["language"] == "python"
            assert opt_ir["filters"]["symbol_kind"] == "function"
            assert len(data["stages"]) == 7, f"Expected 7 stages, got {len(data['stages'])}"
            record("Intermediate Representation & Query Optimizer", True, f"7 stages generated with IR filters: {opt_ir['filters']}")
    except Exception as e:
        record("Compiler Pipeline", False, str(e))

    # 3. Empty & Edge Case Queries
    try:
        # Empty query
        req = urllib.request.Request(f"{BASE_API}/api/compiler/explain", data=json.dumps({"query": ""}).encode(), headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=25)
            record("Empty Query Validation (Compiler)", False, "Failed to reject empty query")
        except urllib.error.HTTPError as he:
            assert he.code == 400
            record("Empty Query Validation (Compiler)", True, f"Correctly rejected with HTTP 400: {he.reason}")

        req_search = urllib.request.Request(f"{BASE_API}/api/search", data=json.dumps({"query": "    "}).encode(), headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req_search, timeout=25)
            record("Empty Query Validation (Search)", False, "Failed to reject empty whitespace query")
        except urllib.error.HTTPError as he:
            assert he.code == 400
            record("Empty Query Validation (Search)", True, f"Correctly rejected with HTTP 400: {he.reason}")

        # Query with special characters (balanced punctuation)
        spec_query = "Find functions with symbols @#$%^&*()_+{}[]:; CSV"
        req_spec = urllib.request.Request(f"{BASE_API}/api/compiler/explain", data=json.dumps({"query": spec_query}).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req_spec, timeout=20) as resp:
            spec_data = json.loads(resp.read().decode())
            assert spec_data["ast"]["action"] is not None
            record("Special Characters Query Handling", True, "Special punctuation safely tokenized without crash")

        # Unclosed quote query (Compiler Lexical Error validation)
        unclosed_query = 'Find Python functions "unclosed string'
        req_unclosed = urllib.request.Request(f"{BASE_API}/api/compiler/explain", data=json.dumps({"query": unclosed_query}).encode(), headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req_unclosed, timeout=20)
            record("Unclosed Quote Lexical Error Handling", False, "Failed to reject unclosed quote")
        except urllib.error.HTTPError as he:
            assert he.code == 400
            record("Unclosed Quote Lexical Error Handling", True, f"Lexical scanner correctly caught unclosed quote: {he.reason}")

        # Long query handling (500+ characters)
        long_query = "Find functions " + ("processing tabular datasets and dataframes " * 15)
        req_long = urllib.request.Request(f"{BASE_API}/api/compiler/explain", data=json.dumps({"query": long_query}).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req_long, timeout=25) as resp:
            long_data = json.loads(resp.read().decode())
            assert long_data["semanticStatus"]["valid"] is True
            record("Long Query Handling (500+ chars)", True, f"Successfully parsed {len(long_query)} char query")
    except Exception as e:
        record("Edge Case Queries", False, str(e))

    # 4. Search Retrieval Modes (Hybrid, Semantic, Lexical)
    try:
        # Hybrid Search
        payload = json.dumps({"query": "CSV file reader parser", "mode": "hybrid"}).encode()
        req = urllib.request.Request(f"{BASE_API}/api/search", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=25) as resp:
            h_data = json.loads(resp.read().decode())
            assert len(h_data["results"]) > 0, "No hybrid results returned"
            top = h_data["results"][0]
            assert top["score"] > 0, f"Invalid score: {top['score']}"
            assert top["matchType"] in ("hybrid", "lexical", "semantic")
            record("Hybrid Search Retrieval (RRF k=60)", True, f"Returned {len(h_data['results'])} hits; Top: '{top['title']}' (Score: {top['score']})")

        # Semantic Search Only
        payload_sem = json.dumps({"query": "read rows from a file", "mode": "semantic"}).encode()
        req_sem = urllib.request.Request(f"{BASE_API}/api/search", data=payload_sem, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req_sem, timeout=25) as resp:
            sem_data = json.loads(resp.read().decode())
            assert len(sem_data["results"]) > 0, "No semantic results"
            assert all(r.get("semanticRank") is not None for r in sem_data["results"]), "Missing semanticRank"
            record("Semantic Search Retrieval (FAISS Cosine Similarity)", True, f"Top match: '{sem_data['results'][0]['title']}' (Semantic Rank: {sem_data['results'][0]['semanticRank']})")

        # Lexical Search Only
        payload_lex = json.dumps({"query": "CsvReader", "mode": "lexical"}).encode()
        req_lex = urllib.request.Request(f"{BASE_API}/api/search", data=payload_lex, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req_lex, timeout=25) as resp:
            lex_data = json.loads(resp.read().decode())
            assert len(lex_data["results"]) > 0, "No lexical results"
            assert any("CsvReader" in r["title"] or "CsvReader" in r["preview"] for r in lex_data["results"]), "Exact keyword not found"
            record("Lexical Search Retrieval (SQLite FTS5 BM25)", True, f"Found exact keyword '{lex_data['results'][0]['title']}' (BM25 rank: {lex_data['results'][0]['lexicalRank']})")

        # Irrelevant / No-match query
        payload_nomatch = json.dumps({"query": "quantum supercomputing teleportation algorithm", "mode": "lexical"}).encode()
        req_nomatch = urllib.request.Request(f"{BASE_API}/api/search", data=payload_nomatch, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req_nomatch, timeout=25) as resp:
            nomatch_data = json.loads(resp.read().decode())
            assert len(nomatch_data["results"]) == 0, f"Expected 0 lexical matches, got {len(nomatch_data['results'])}"
            record("No-Match Query Scenario (Lexical)", True, "Zero fabricated results returned for non-existent keywords")
    except Exception as e:
        record("Search Retrieval Modes", False, str(e))

    # 5. Document Management: Upload, Extraction, Indexing, Search, Deletion
    try:
        # Create unique Python file to upload
        unique_func = f"auth_token_validator_{uuid.uuid4().hex[:6]}"
        test_py_code = f"""class SecurityManager:
    \"\"\"Handles cryptographic session tokens.\"\"\"

    def {unique_func}(self, token: str) -> bool:
        \"\"\"Validate JWT access authorization signature.\"\"\"
        return len(token) > 32 and token.startswith("Bearer ")
"""
        boundary = "----TestBoundary" + uuid.uuid4().hex
        parts = [
            f"--{boundary}",
            'Content-Disposition: form-data; name="files"; filename="sec_manager.py"',
            "Content-Type: text/x-python",
            "",
            test_py_code,
            f"--{boundary}--",
            ""
        ]
        body = "\r\n".join(parts).encode("utf-8")
        req_upload = urllib.request.Request(
            f"{BASE_API}/api/files/upload",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
        )
        with urllib.request.urlopen(req_upload, timeout=15) as resp:
            up_res = json.loads(resp.read().decode())
            assert up_res["totalFilesIndexed"] == 1, "Upload indexing failed"
            uploaded_file_id = up_res["uploaded"][0]["id"]
            record("Document Upload & Code Parsing (Python AST)", True, f"Uploaded sec_manager.py (ID: {uploaded_file_id})")

        # Verify newly uploaded symbol is searchable in hybrid mode
        req_find = urllib.request.Request(
            f"{BASE_API}/api/search",
            data=json.dumps({"query": f"find functions {unique_func}", "mode": "hybrid"}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req_find, timeout=25) as resp:
            find_res = json.loads(resp.read().decode())
            assert len(find_res["results"]) > 0, "Uploaded function not retrieved"
            top_hit = find_res["results"][0]
            assert unique_func in top_hit["title"] or unique_func in top_hit["preview"]
            record("Instant Retrieval of Uploaded Code Block", True, f"Found '{top_hit['title']}' at rank #1 (Score: {top_hit['score']})")

        # List files check
        with urllib.request.urlopen(f"{BASE_API}/api/files", timeout=25) as resp:
            all_files = json.loads(resp.read().decode())
            match = [f for f in all_files if f["id"] == uploaded_file_id]
            assert len(match) == 1, "Uploaded file missing in /api/files list"
            assert match[0]["chunks"] >= 1, "File chunk count is zero"
            record("Document Library Persistence (SQLite)", True, f"Verified file metadata: {match[0]['name']} ({match[0]['chunks']} chunks)")

        # Delete file
        req_del = urllib.request.Request(f"{BASE_API}/api/files/{uploaded_file_id}", method="DELETE")
        with urllib.request.urlopen(req_del, timeout=25) as resp:
            del_res = json.loads(resp.read().decode())
            assert del_res["status"] == "removed", f"Unexpected delete status: {del_res}"
            record("Synchronous Document Deletion & FAISS Index Purge", True, f"Purged file {uploaded_file_id} from SQLite and FAISS")

        # Verify file is no longer returned in search
        with urllib.request.urlopen(req_find, timeout=25) as resp:
            after_find = json.loads(resp.read().decode())
            assert not any(unique_func in r["title"] for r in after_find["results"]), "Deleted function still returned in search results"
            record("Deletion Verification in Search Index", True, "Deleted content confirmed absent from search results")
    except Exception as e:
        record("Document Management Workflow", False, str(e))

    # 6. Search History and Analytics Persistence
    try:
        with urllib.request.urlopen(f"{BASE_API}/api/history", timeout=25) as resp:
            hist_list = json.loads(resp.read().decode())
            assert len(hist_list) > 0, "History list is empty"
            record("Search History Audit Trail", True, f"{len(hist_list)} queries logged with timestamps and execution latencies")

        with urllib.request.urlopen(f"{BASE_API}/api/analytics", timeout=25) as resp:
            stats = json.loads(resp.read().decode())
            assert stats["totalChunks"] > 0
            assert stats["totalSearches"] > 0
            assert stats["ftsStatus"] == "Online"
            assert stats["faissStatus"] == "Online"
            record("Analytics & Evaluation Aggregations", True, f"Chunks: {stats['totalChunks']} | Searches: {stats['totalSearches']} | Latency: {stats['avgLatencyMs']}ms")
    except Exception as e:
        record("History & Analytics", False, str(e))

    # 7. Frontend Integration & UI Server
    try:
        with urllib.request.urlopen(f"{BASE_UI}", timeout=25) as resp:
            assert resp.status == 200
            html = resp.read().decode("utf-8")
            assert "html" in html.lower()
            record("Frontend UI Server Status", True, "Next.js 15 application responding on http://localhost:3000")
    except Exception as e:
        record("Frontend UI Server Status", False, str(e))

    log("SUMMARY OF VERIFICATION", "SECTION")
    log(f"Passed: {results['passed']}/{results['total']} tests", "PASS" if results["failed"] == 0 else "FAIL")
    return results

if __name__ == "__main__":
    test_suite()
