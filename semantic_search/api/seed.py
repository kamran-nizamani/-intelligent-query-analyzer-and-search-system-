import os
import shutil
import sqlite3
import time
from pathlib import Path

from semantic_search.processing import process_file
from semantic_search.retrieval import (
    HybridSearchEngine,
    LocalSearchIndex,
    SentenceTransformerEmbedder,
)

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "search.sqlite3"
FIXTURES_DIR = Path("tests") / "fixtures"


def seed_corpus():
    print(f"Connecting to database at {DB_PATH}...")
    index = LocalSearchIndex(DB_PATH)
    embedder = SentenceTransformerEmbedder("sentence-transformers/all-MiniLM-L6-v2")
    engine = HybridSearchEngine(index, embedder)

    fixture_files = list(FIXTURES_DIR.glob("*.*"))
    print(f"Found {len(fixture_files)} initial files in {FIXTURES_DIR}")

    seeded_meta = []
    for f in fixture_files:
        dest = UPLOAD_DIR / f.name
        shutil.copyfile(f, dest)

        file_ext = dest.suffix.lower()
        if file_ext == ".py":
            f_type, c_kind = "PY", "code"
        elif file_ext in (".js", ".jsx"):
            f_type, c_kind = "JS", "code"
        elif file_ext == ".java":
            f_type, c_kind = "JAVA", "code"
        elif file_ext == ".pdf":
            f_type, c_kind = "PDF", "document"
        elif file_ext == ".docx":
            f_type, c_kind = "DOCX", "document"
        else:
            f_type, c_kind = "TXT", "document"

        chunks = process_file(dest)
        engine.index_file(dest, chunks)
        print(f"Indexed {dest.name}: {len(chunks)} real chunk(s).")

        seeded_meta.append((
            f"doc-{f.stem}",
            dest.name,
            str(dest.resolve()),
            f_type,
            c_kind,
            dest.stat().st_size,
            len(chunks),
            "Indexed",
        ))

    index.close()

    # Now write metadata records into uploaded_documents
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    try:
        conn.executemany(
            """
            INSERT OR REPLACE INTO uploaded_documents (id, name, storage_path, file_type, content_kind, file_size, chunk_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            seeded_meta,
        )
        conn.commit()
    finally:
        conn.close()

    print("Successfully seeded database with real chunks and document records!")


if __name__ == "__main__":
    seed_corpus()
