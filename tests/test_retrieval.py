import re
import tempfile
import unittest
from pathlib import Path

import numpy as np

from semantic_search.compiler.ir import QueryIR
from semantic_search.processing.models import SearchChunk
from semantic_search.retrieval.engine import (
    HybridSearchEngine,
    reciprocal_rank_fusion,
)
from semantic_search.retrieval.local_index import (
    LocalSearchIndex,
    build_fts_query,
)
from semantic_search.retrieval.models import RetrievalHit


class TestEmbedder:
    _AUTH_TERMS = {
        "account",
        "access",
        "authentication",
        "credentials",
        "login",
        "password",
        "recover",
        "reset",
        "secret",
        "user",
    }
    _CSV_TERMS = {"comma", "csv", "delimited", "parse", "parse_csv", "rows"}

    def encode(self, texts: list[str]) -> np.ndarray:
        vectors = []
        for text in texts:
            terms = set(re.findall(r"[\w]+", text.casefold()))
            vector = np.array(
                [
                    float(bool(terms & self._AUTH_TERMS)),
                    float(bool(terms & self._CSV_TERMS)),
                    1.0,
                ],
                dtype=np.float32,
            )
            vectors.append(vector)
        return np.stack(vectors)


def make_chunk(
    chunk_id: str,
    text: str,
    *,
    content_kind: str = "document",
    source_type: str = "txt",
    language: str | None = None,
    symbol_kind: str | None = None,
) -> SearchChunk:
    return SearchChunk(
        chunk_id=chunk_id,
        content_kind=content_kind,
        source_type=source_type,
        file_path=f"C:\\samples\\{chunk_id}.{'py' if language else 'txt'}",
        text_content=text,
        display_content=text,
        start_line=3 if language else None,
        end_line=8 if language else None,
        symbol_name=chunk_id if language else None,
        symbol_kind=symbol_kind,
        language=language,
    )


class RetrievalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "search.sqlite3"
        self.index = LocalSearchIndex(self.db_path)
        self.addCleanup(self.index.close)
        self.engine = HybridSearchEngine(self.index, TestEmbedder())
        self.chunks = [
            make_chunk(
                "csv-function",
                "parse_csv parses comma separated rows from a file",
                content_kind="code",
                source_type="python",
                language="python",
                symbol_kind="function",
            ),
            make_chunk(
                "auth-notes",
                "Authentication credentials can be reset to recover account access.",
            ),
            make_chunk(
                "unrelated",
                "A guide to planting flowers in a small garden.",
            ),
        ]
        self.engine.index_chunks(self.chunks)

    def test_lexical_bm25_finds_exact_identifier_and_applies_ir_filters(self) -> None:
        query = QueryIR(
            "HYBRID_SEARCH",
            {
                "content_kind": "code",
                "language": "python",
                "symbol_kind": "function",
            },
            "parse_csv",
            "parse_csv",
            10,
            "rrf",
        )
        results = self.engine.search(query)
        self.assertEqual([result.chunk.chunk_id for result in results], ["csv-function"])
        self.assertEqual(results[0].lexical_rank, 1)
        self.assertIn("parse_csv", results[0].snippet)
        self.assertEqual(results[0].chunk.start_line, 3)

    def test_semantic_retrieval_finds_paraphrase_and_explains_rank(self) -> None:
        query = QueryIR(
            "HYBRID_SEARCH",
            {"content_kind": "document"},
            "zzz_no_lexical_match",
            "restore login after forgetting a secret",
            5,
            "rrf",
        )
        results = self.engine.search(query)
        self.assertEqual(results[0].chunk.chunk_id, "auth-notes")
        self.assertEqual(results[0].vector_rank, 1)
        self.assertIn("Semantic rank 1", results[0].explanation)

    def test_hybrid_fusion_deduplicates_chunks_and_combines_ranks(self) -> None:
        chunk = self.chunks[0]
        results = reciprocal_rank_fusion(
            [RetrievalHit(chunk, -1.0)],
            [RetrievalHit(chunk, 0.9), RetrievalHit(self.chunks[1], 0.6)],
            "parse_csv",
        )
        self.assertEqual(
            [result.chunk.chunk_id for result in results],
            ["csv-function", "auth-notes"],
        )
        self.assertEqual(results[0].lexical_rank, 1)
        self.assertEqual(results[0].vector_rank, 1)
        self.assertAlmostEqual(results[0].rrf_score, 2 / 61)

    def test_sqlite_index_survives_reopen_and_deletes_chunks(self) -> None:
        self.index.close()
        reopened = LocalSearchIndex(self.db_path)
        try:
            self.assertEqual(reopened.chunk_count, 3)
            self.assertEqual(
                [
                    hit.chunk.chunk_id
                    for hit in reopened.lexical_search("parse_csv", {}, 5)
                ],
                ["csv-function"],
            )
            reopened.delete_chunks(["csv-function"])
            self.assertEqual(reopened.chunk_count, 2)
            self.assertEqual(reopened.lexical_search("parse_csv", {}, 5), [])
        finally:
            reopened.close()

    def test_duplicate_upsert_replaces_content_without_duplicate_chunks(self) -> None:
        replacement = make_chunk("csv-function", "CSV format parser")
        self.engine.index_chunks([replacement])
        self.assertEqual(self.index.chunk_count, 3)
        self.assertEqual(
            [
                hit.chunk.text_content
                for hit in self.index.lexical_search("format", {}, 5)
            ],
            ["CSV format parser"],
        )

    def test_rejects_embedding_dimension_changes_without_corrupting_index(self) -> None:
        replacement = make_chunk("new-chunk", "new indexed content")
        with self.assertRaisesRegex(ValueError, "Embedding dimension changed"):
            self.index.add_chunks([replacement], np.array([[1.0, 0.0]], dtype=np.float32))
        self.assertEqual(self.index.chunk_count, 3)

    def test_fts_query_quotes_terms_instead_of_executing_fts_operators(self) -> None:
        query = build_fts_query('parse_csv OR "user access"')
        self.assertEqual(query, '"parse_csv" OR "OR" OR "user access"')


if __name__ == "__main__":
    unittest.main()
