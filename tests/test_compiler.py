import unittest

from semantic_search.compiler import compile_query
from semantic_search.compiler.errors import (
    LexicalError,
    ParseError,
    SemanticError,
)
from semantic_search.compiler.lexer import Lexer


class LexerTests(unittest.TestCase):
    def test_classifies_query_tokens_and_preserves_positions(self) -> None:
        tokens = Lexer().tokenize("Find Python functions about CSV")
        self.assertEqual(
            [token.kind.value for token in tokens],
            ["ACTION", "LANGUAGE", "TARGET", "RELATION", "WORD", "EOF"],
        )
        self.assertEqual(tokens[1].position, 5)
        self.assertEqual(tokens[2].value, "function")

    def test_preserves_quoted_topic_phrase(self) -> None:
        tokens = Lexer().tokenize('find notes "neural networks"')
        self.assertEqual(tokens[2].value, "neural networks")
        self.assertEqual(tokens[2].kind.value, "PHRASE")

    def test_rejects_unclosed_quotes(self) -> None:
        with self.assertRaises(LexicalError):
            Lexer().tokenize('find notes "neural networks')


class CompilerPipelineTests(unittest.TestCase):
    def test_generates_and_optimizes_code_search_ir(self) -> None:
        result = compile_query("Find Python functions that process CSV files")
        self.assertEqual(result.ast.target, "function")
        self.assertEqual(result.ast.language, "python")
        self.assertEqual(result.ast.topic, "process CSV files")
        self.assertEqual(
            result.ir.filters,
            {
                "content_kind": "code",
                "symbol_kind": "function",
                "language": "python",
            },
        )
        self.assertEqual(result.optimized_ir.lexical_query, "process CSV files")
        self.assertEqual(result.optimized_ir.fusion, "rrf")

    def test_defaults_action_and_limit_and_keeps_descriptive_terms(self) -> None:
        result = compile_query("notes about neural networks")
        self.assertEqual(result.ast.action, "find")
        self.assertEqual(result.ast.limit, 10)
        self.assertEqual(result.ast.topic, "neural networks")
        self.assertEqual(result.ir.filters, {"content_kind": "document"})

    def test_parses_explicit_limit(self) -> None:
        result = compile_query("find code about parsing limit 25")
        self.assertEqual(result.optimized_ir.limit, 25)
        self.assertEqual(result.ast.topic, "parsing")

    def test_rejects_conflicting_targets(self) -> None:
        with self.assertRaises(ParseError):
            compile_query("find documents and functions about indexing")

    def test_rejects_language_filter_for_document_search(self) -> None:
        with self.assertRaises(SemanticError):
            compile_query("find Python documents about indexing")

    def test_rejects_empty_topic_and_invalid_limit(self) -> None:
        with self.assertRaises(SemanticError):
            compile_query("find Python functions")
        with self.assertRaises(SemanticError):
            compile_query("find notes about indexing limit 101")


if __name__ == "__main__":
    unittest.main()
