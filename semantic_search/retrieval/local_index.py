import json
import re
import sqlite3
from pathlib import Path

import faiss
import numpy as np

from semantic_search.processing.models import SearchChunk

from .models import RetrievalHit

_FILTER_COLUMNS = {
    "content_kind": "content_kind",
    "source_type": "source_type",
    "language": "language",
    "symbol_kind": "symbol_kind",
}
_FTS_TERM = re.compile(r'"([^"]+)"|([\w#+-]+)', re.UNICODE)


def build_fts_query(query: str) -> str:
    terms: list[str] = []
    for match in _FTS_TERM.finditer(query):
        phrase = match.group(1)
        term = phrase if phrase is not None else match.group(2)
        if term:
            terms.append('"' + term.replace('"', '""') + '"')
    return " OR ".join(terms)


def normalize_vectors(vectors: np.ndarray) -> np.ndarray:
    result = np.asarray(vectors, dtype=np.float32)
    if result.ndim != 2:
        raise ValueError("Embeddings must be a two-dimensional array.")
    if not np.isfinite(result).all():
        raise ValueError("Embeddings must contain only finite numbers.")
    norms = np.linalg.norm(result, axis=1, keepdims=True)
    if np.any(norms == 0):
        raise ValueError("Embeddings must have non-zero length.")
    return np.ascontiguousarray(result / norms, dtype=np.float32)


class SQLiteSearchStore:
    def __init__(
        self,
        path: str | Path = Path("data") / "search.sqlite3",
    ) -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.path, timeout=30.0, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._closed = False
        self._connection.execute("PRAGMA foreign_keys = ON")
        if self.path != ":memory:":
            self._connection.execute("PRAGMA journal_mode = WAL")
        self._initialize()

    def _initialize(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS chunks (
                chunk_id TEXT PRIMARY KEY,
                content_kind TEXT NOT NULL,
                source_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                text_content TEXT NOT NULL,
                display_content TEXT NOT NULL,
                page_number INTEGER,
                section TEXT,
                start_line INTEGER,
                end_line INTEGER,
                symbol_name TEXT,
                symbol_kind TEXT,
                language TEXT,
                identifiers_json TEXT NOT NULL,
                metadata_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS embeddings (
                vector_id INTEGER PRIMARY KEY AUTOINCREMENT,
                chunk_id TEXT NOT NULL UNIQUE
                    REFERENCES chunks(chunk_id) ON DELETE CASCADE,
                dimension INTEGER NOT NULL,
                vector BLOB NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                chunk_id UNINDEXED,
                text_content,
                file_path,
                tokenize='unicode61 remove_diacritics 2'
            );
            """
        )
        self._connection.commit()

    @property
    def chunk_count(self) -> int:
        row = self._connection.execute("SELECT COUNT(*) AS count FROM chunks").fetchone()
        return int(row["count"])

    def upsert_chunks(self, chunks: list[SearchChunk], vectors: np.ndarray) -> None:
        normalized = self._validate_vectors(chunks, vectors)
        if not chunks:
            return
        with self._connection:
            self._write_chunks(chunks, normalized)

    def replace_file_chunks(
        self,
        file_path: str,
        chunks: list[SearchChunk],
        vectors: np.ndarray,
    ) -> None:
        normalized = self._validate_vectors(chunks, vectors)
        if any(chunk.file_path != file_path for chunk in chunks):
            raise ValueError("All replacement chunks must belong to the requested file.")
        with self._connection:
            old_ids = [
                row["chunk_id"]
                for row in self._connection.execute(
                    "SELECT chunk_id FROM chunks WHERE file_path = ?", (file_path,)
                )
            ]
            for chunk_id in old_ids:
                self._connection.execute(
                    "DELETE FROM chunks_fts WHERE chunk_id = ?", (chunk_id,)
                )
            self._connection.execute(
                "DELETE FROM chunks WHERE file_path = ?", (file_path,)
            )
            if chunks:
                self._write_chunks(chunks, normalized)

    def delete_chunks(self, chunk_ids: list[str]) -> None:
        with self._connection:
            for chunk_id in chunk_ids:
                self._connection.execute(
                    "DELETE FROM chunks_fts WHERE chunk_id = ?", (chunk_id,)
                )
                self._connection.execute(
                    "DELETE FROM chunks WHERE chunk_id = ?", (chunk_id,)
                )

    def lexical_search(
        self,
        query: str,
        filters: dict[str, str],
        limit: int,
    ) -> list[RetrievalHit]:
        fts_query = build_fts_query(query)
        if not fts_query:
            return []
        where, values = self._filter_sql(filters)
        sql = f"""
            SELECT c.*, bm25(chunks_fts, 0.0, 1.0, 0.2) AS search_score
            FROM chunks_fts
            JOIN chunks AS c ON c.chunk_id = chunks_fts.chunk_id
            WHERE chunks_fts MATCH ? {where}
            ORDER BY search_score ASC, c.chunk_id ASC
            LIMIT ?
        """
        rows = self._connection.execute(sql, [fts_query, *values, limit]).fetchall()
        return [
            RetrievalHit(self._chunk_from_row(row), float(row["search_score"]))
            for row in rows
        ]

    def load_embeddings(self) -> list[tuple[int, SearchChunk, np.ndarray]]:
        rows = self._connection.execute(
            """
            SELECT e.vector_id, e.dimension, e.vector, c.*
            FROM embeddings AS e
            JOIN chunks AS c ON c.chunk_id = e.chunk_id
            ORDER BY e.vector_id
            """
        ).fetchall()
        return [
            (
                int(row["vector_id"]),
                self._chunk_from_row(row),
                np.frombuffer(row["vector"], dtype=np.float32, count=row["dimension"]),
            )
            for row in rows
        ]

    def close(self) -> None:
        if not self._closed:
            self._connection.close()
            self._closed = True

    @staticmethod
    def _chunk_values(chunk: SearchChunk) -> tuple[object, ...]:
        return (
            chunk.chunk_id,
            chunk.content_kind,
            chunk.source_type,
            chunk.file_path,
            chunk.text_content,
            chunk.display_content,
            chunk.page_number,
            chunk.section,
            chunk.start_line,
            chunk.end_line,
            chunk.symbol_name,
            chunk.symbol_kind,
            chunk.language,
            json.dumps(chunk.identifiers, ensure_ascii=False),
            json.dumps(chunk.metadata, ensure_ascii=False, sort_keys=True),
        )

    def _validate_vectors(
        self,
        chunks: list[SearchChunk],
        vectors: np.ndarray,
    ) -> np.ndarray:
        normalized = normalize_vectors(vectors)
        if normalized.shape[0] != len(chunks):
            raise ValueError("Provide exactly one embedding for each chunk.")
        if chunks:
            dimensions = {normalized.shape[1]}
            current_dimensions = {
                int(row["dimension"])
                for row in self._connection.execute(
                    "SELECT DISTINCT dimension FROM embeddings"
                )
            }
            if current_dimensions and current_dimensions != dimensions:
                raise ValueError(
                    "Embedding dimension changed; reindex existing chunks with one model."
                )
        return normalized

    def _write_chunks(
        self,
        chunks: list[SearchChunk],
        vectors: np.ndarray,
    ) -> None:
        for chunk, vector in zip(chunks, vectors, strict=True):
            self._connection.execute(
                """
                INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chunk_id) DO UPDATE SET
                    content_kind=excluded.content_kind,
                    source_type=excluded.source_type,
                    file_path=excluded.file_path,
                    text_content=excluded.text_content,
                    display_content=excluded.display_content,
                    page_number=excluded.page_number,
                    section=excluded.section,
                    start_line=excluded.start_line,
                    end_line=excluded.end_line,
                    symbol_name=excluded.symbol_name,
                    symbol_kind=excluded.symbol_kind,
                    language=excluded.language,
                    identifiers_json=excluded.identifiers_json,
                    metadata_json=excluded.metadata_json
                """,
                self._chunk_values(chunk),
            )
            self._connection.execute(
                "DELETE FROM chunks_fts WHERE chunk_id = ?", (chunk.chunk_id,)
            )
            self._connection.execute(
                "INSERT INTO chunks_fts(chunk_id, text_content, file_path) VALUES (?, ?, ?)",
                (chunk.chunk_id, chunk.text_content, chunk.file_path),
            )
            self._connection.execute(
                """
                INSERT INTO embeddings(chunk_id, dimension, vector)
                VALUES (?, ?, ?)
                ON CONFLICT(chunk_id) DO UPDATE SET
                    dimension=excluded.dimension,
                    vector=excluded.vector
                """,
                (
                    chunk.chunk_id,
                    vectors.shape[1],
                    vector.tobytes(),
                ),
            )

    @staticmethod
    def _chunk_from_row(row: sqlite3.Row) -> SearchChunk:
        return SearchChunk(
            chunk_id=row["chunk_id"],
            content_kind=row["content_kind"],
            source_type=row["source_type"],
            file_path=row["file_path"],
            text_content=row["text_content"],
            display_content=row["display_content"],
            page_number=row["page_number"],
            section=row["section"],
            start_line=row["start_line"],
            end_line=row["end_line"],
            symbol_name=row["symbol_name"],
            symbol_kind=row["symbol_kind"],
            language=row["language"],
            identifiers=tuple(json.loads(row["identifiers_json"])),
            metadata=json.loads(row["metadata_json"]),
        )

    @staticmethod
    def _filter_sql(filters: dict[str, str]) -> tuple[str, list[str]]:
        conditions: list[str] = []
        values: list[str] = []
        for key, value in filters.items():
            column = _FILTER_COLUMNS.get(key)
            if column is None:
                raise ValueError(f"Unsupported search filter '{key}'.")
            conditions.append(f"c.{column} = ?")
            values.append(value)
        return (
            ("AND " + " AND ".join(conditions)) if conditions else "",
            values,
        )


class FaissVectorIndex:
    def __init__(self) -> None:
        self._index: faiss.IndexIDMap2 | None = None
        self._dimension: int | None = None

    @property
    def size(self) -> int:
        return 0 if self._index is None else int(self._index.ntotal)

    def rebuild(
        self,
        vector_ids: list[int],
        vectors: np.ndarray,
    ) -> None:
        if not vector_ids:
            self._index = None
            self._dimension = None
            return
        normalized = normalize_vectors(vectors)
        if len(vector_ids) != normalized.shape[0]:
            raise ValueError("Provide exactly one vector ID for each embedding.")
        self._dimension = normalized.shape[1]
        self._index = faiss.IndexIDMap2(faiss.IndexFlatIP(self._dimension))
        self._index.add_with_ids(
            normalized,
            np.asarray(vector_ids, dtype=np.int64),
        )

    def search(self, vector: np.ndarray, limit: int) -> list[tuple[int, float]]:
        if self._index is None:
            return []
        query = normalize_vectors(np.asarray(vector, dtype=np.float32).reshape(1, -1))
        if query.shape[1] != self._dimension:
            raise ValueError("Query embedding dimension does not match the index.")
        count = min(limit, self.size)
        scores, ids = self._index.search(query, count)
        return [
            (int(vector_id), float(score))
            for vector_id, score in zip(ids[0], scores[0], strict=True)
            if vector_id >= 0
        ]


class LocalSearchIndex:
    def __init__(
        self,
        path: str | Path = Path("data") / "search.sqlite3",
    ) -> None:
        self.store = SQLiteSearchStore(path)
        self.vector_index = FaissVectorIndex()
        self._chunks_by_vector_id: dict[int, SearchChunk] = {}
        self._rebuild_vector_index()

    @property
    def chunk_count(self) -> int:
        return self.store.chunk_count

    def add_chunks(
        self,
        chunks: list[SearchChunk],
        vectors: np.ndarray,
    ) -> None:
        if not chunks:
            if np.asarray(vectors).size:
                raise ValueError("Embeddings were provided without chunks.")
            return
        self.store.upsert_chunks(chunks, vectors)
        self._rebuild_vector_index()

    def replace_file_chunks(
        self,
        file_path: str,
        chunks: list[SearchChunk],
        vectors: np.ndarray,
    ) -> None:
        self.store.replace_file_chunks(file_path, chunks, vectors)
        self._rebuild_vector_index()

    def delete_chunks(self, chunk_ids: list[str]) -> None:
        self.store.delete_chunks(chunk_ids)
        self._rebuild_vector_index()

    def lexical_search(
        self,
        query: str,
        filters: dict[str, str],
        limit: int,
    ) -> list[RetrievalHit]:
        return self.store.lexical_search(query, filters, limit)

    def vector_search(
        self,
        vector: np.ndarray,
        filters: dict[str, str],
        limit: int,
    ) -> list[RetrievalHit]:
        candidates = self.vector_index.search(vector, self.vector_index.size)
        hits: list[RetrievalHit] = []
        for vector_id, score in candidates:
            chunk = self._chunks_by_vector_id[vector_id]
            if _matches_filters(chunk, filters):
                hits.append(RetrievalHit(chunk, score))
                if len(hits) == limit:
                    break
        return hits

    def close(self) -> None:
        self.store.close()

    def _rebuild_vector_index(self) -> None:
        rows = self.store.load_embeddings()
        self._chunks_by_vector_id = {
            vector_id: chunk for vector_id, chunk, _ in rows
        }
        if not rows:
            self.vector_index.rebuild([], np.empty((0, 0), dtype=np.float32))
            return
        vector_ids = [vector_id for vector_id, _, _ in rows]
        vectors = np.stack([vector for _, _, vector in rows])
        self.vector_index.rebuild(vector_ids, vectors)


def _matches_filters(chunk: SearchChunk, filters: dict[str, str]) -> bool:
    for key, expected in filters.items():
        attribute = _FILTER_COLUMNS.get(key)
        if attribute is None:
            raise ValueError(f"Unsupported search filter '{key}'.")
        if getattr(chunk, attribute) != expected:
            return False
    return True
