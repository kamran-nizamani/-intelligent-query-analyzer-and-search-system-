import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

import pymupdf
from docx import Document

from semantic_search.processing.chunking import chunk_code_symbols, chunk_documents
from semantic_search.processing.code import extract_code
from semantic_search.processing.documents import extract_document
from semantic_search.processing.errors import ProcessingError, UnsupportedFileError
from semantic_search.processing.pipeline import process_file


FIXTURES = Path(__file__).parent / "fixtures"


class DocumentProcessingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_path = Path(self.temp_dir.name)

    def test_extracts_pdf_pages_and_keeps_page_locations(self) -> None:
        path = self.temp_path / "sample.pdf"
        with pymupdf.open() as document:
            for content in ("Vector search notes", "Lexical ranking notes"):
                page = document.new_page()
                page.insert_text((72, 72), content)
            document.save(path)

        blocks = extract_document(path)
        chunks = process_file(path)
        self.assertEqual([block.page_number for block in blocks], [1, 2])
        self.assertEqual({chunk.page_number for chunk in chunks}, {1, 2})

    def test_extracts_docx_headings_paragraphs_and_tables(self) -> None:
        path = self.temp_path / "sample.docx"
        document = Document()
        document.add_heading("Hybrid Retrieval", level=1)
        document.add_paragraph("BM25 finds exact terms.")
        table = document.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "Vector"
        table.cell(0, 1).text = "Semantic ranking"
        document.save(path)

        blocks = extract_document(path)
        self.assertEqual(blocks[1].section, "Hybrid Retrieval")
        self.assertTrue(any("Vector | Semantic ranking" in b.display_text for b in blocks))
        self.assertTrue(all(b.page_number is None for b in blocks))
        chunk = process_file(path)[0]
        self.assertIn("source_metadata", chunk.metadata)
        self.assertTrue(
            any("table_number" in item for item in chunk.metadata["source_metadata"])
        )

    def test_extracts_txt_paragraphs_and_line_locations(self) -> None:
        path = FIXTURES / "lecture_notes.txt"
        blocks = extract_document(path)
        self.assertEqual(blocks[0].start_line, 1)
        self.assertEqual(blocks[0].end_line, 2)
        self.assertEqual(blocks[1].start_line, 4)
        chunks = chunk_documents(blocks, max_words=5, overlap_words=1)
        self.assertTrue(chunks)
        self.assertEqual(chunks[0].start_line, 1)
        self.assertEqual(chunks[0].end_line, 1)
        self.assertIn("\n", blocks[0].display_text)


class CodeProcessingTests(unittest.TestCase):
    def test_extracts_python_classes_functions_identifiers_and_calls(self) -> None:
        blocks = extract_code(FIXTURES / "sample.py")
        by_name = {block.symbol_name: block for block in blocks}
        self.assertEqual(by_name["CsvReader"].symbol_kind, "class")
        self.assertEqual(by_name["parse_csv"].symbol_kind, "function")
        self.assertIn("path", by_name["parse_csv"].identifiers)
        self.assertIn("open", by_name["parse_csv"].metadata["calls"])
        self.assertIn("comma-separated values", by_name["parse_csv"].searchable_text)

    def test_extracts_java_class_methods_and_source_ranges(self) -> None:
        blocks = extract_code(FIXTURES / "sample.java")
        by_name = {block.symbol_name: block for block in blocks}
        self.assertEqual(by_name["AuthService"].symbol_kind, "class")
        self.assertEqual(by_name["validateCredentials"].symbol_kind, "function")
        self.assertEqual(by_name["validateCredentials"].start_line, 3)
        self.assertIn(
            "checkPassword", by_name["validateCredentials"].metadata["calls"]
        )

    def test_extracts_javascript_functions_classes_methods_and_arrows(self) -> None:
        blocks = extract_code(FIXTURES / "sample.js")
        names = {block.symbol_name: block.symbol_kind for block in blocks}
        self.assertEqual(names["normalizeName"], "function")
        self.assertEqual(names["UserManager"], "class")
        self.assertEqual(names["findUser"], "function")
        self.assertEqual(names["parseCsv"], "function")

    def test_code_chunking_splits_long_symbols_with_overlapping_line_ranges(self) -> None:
        path = FIXTURES / "sample.py"
        block = extract_code(path)[-1]
        long_block = replace(
            block,
            display_text="\n".join(f"line_{n}" for n in range(1, 13)),
            start_line=20,
        )
        chunks = chunk_code_symbols([long_block], max_lines=5, overlap_lines=1)
        self.assertEqual(
            [(chunk.start_line, chunk.end_line) for chunk in chunks],
            [(20, 24), (24, 28), (28, 31)],
        )
        self.assertIn("line_5", chunks[1].text_content)
        self.assertNotIn("line_1", chunks[1].text_content)

    def test_reports_invalid_python_and_unsupported_file_types(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            invalid = Path(temp_dir) / "invalid.py"
            invalid.write_text("def broken(:\n", encoding="utf-8")
            with self.assertRaises(ProcessingError):
                extract_code(invalid)
            unsupported = Path(temp_dir) / "archive.zip"
            unsupported.write_bytes(b"")
            with self.assertRaises(UnsupportedFileError):
                process_file(unsupported)


if __name__ == "__main__":
    unittest.main()
