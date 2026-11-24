import contextlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path

import numpy as np

from semantic_search.cli import main
from semantic_search.compiler import compile_query
from semantic_search.processing import process_file
from semantic_search.retrieval import HybridSearchEngine, LocalSearchIndex

FIXTURES = Path(__file__).parent / "fixtures"


class FixtureEmbedder:
    def encode(self, texts: list[str]) -> np.ndarray:
        vectors = []
        for text in texts:
            terms = set(re.findall(r"[\w]+", text.casefold()))
            code_related = bool(terms & {"csv", "parse", "rows", "comma"})
            vectors.append(
                np.asarray(
                    [float(code_related), float(not code_related), 1.0],
                    dtype=np.float32,
                )
            )
        return np.stack(vectors)


class CoreIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.index = LocalSearchIndex(":memory:")
        self.addCleanup(self.index.close)
        self.engine = HybridSearchEngine(self.index, FixtureEmbedder())

    def test_compiler_processor_and_hybrid_search_return_source_aware_result(self) -> None:
        chunks = process_file(FIXTURES / "sample.py")
        self.engine.index_file(FIXTURES / "sample.py", chunks)

        plan = compile_query("Find Python functions about parse_csv").optimized_ir
        results = self.engine.search(plan)

        self.assertTrue(results)
        self.assertEqual(results[0].chunk.symbol_name, "parse_csv")
        self.assertEqual(results[0].chunk.language, "python")
        self.assertEqual((results[0].chunk.start_line, results[0].chunk.end_line), (8, 10))
        self.assertIn("Lexical rank 1", results[0].explanation)

    def test_document_search_preserves_text_line_and_document_filter(self) -> None:
        self.engine.index_file(
            FIXTURES / "lecture_notes.txt",
            process_file(FIXTURES / "lecture_notes.txt"),
        )
        plan = compile_query("Find notes about vector retrieval").optimized_ir
        results = self.engine.search(plan)

        self.assertTrue(results)
        self.assertEqual(results[0].chunk.content_kind, "document")
        self.assertEqual(results[0].chunk.start_line, 1)
        self.assertIn("Vector retrieval", results[0].snippet)

    def test_reindexing_replaces_old_file_chunks_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "notes.txt"
            path.write_text("obsolete telescope archive", encoding="utf-8")
            self.engine.index_file(path, process_file(path))
            self.assertEqual(self.index.chunk_count, 1)

            path.write_text("current botanical garden notes", encoding="utf-8")
            self.engine.index_file(path, process_file(path))
            self.assertEqual(self.index.chunk_count, 1)
            self.assertEqual(self.index.lexical_search("obsolete", {}, 5), [])
            self.assertEqual(
                self.index.lexical_search("botanical", {}, 5)[0].chunk.file_path,
                str(path.resolve()),
            )

    def test_cli_explain_outputs_compiler_stages_as_json(self) -> None:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = main(["explain", "Find Python functions about CSV parsing"])

        result = json.loads(output.getvalue())
        self.assertEqual(status, 0)
        self.assertEqual(result["ast"]["target"], "function")
        self.assertEqual(result["optimized_ir"]["filters"]["language"], "python")


if __name__ == "__main__":
    unittest.main()
