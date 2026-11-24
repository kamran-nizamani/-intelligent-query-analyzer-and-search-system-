import argparse
import json
import sqlite3
import sys
from pathlib import Path

from semantic_search.compiler import compile_query
from semantic_search.compiler.errors import CompilerError
from semantic_search.processing import process_file
from semantic_search.processing.errors import ProcessingError
from semantic_search.retrieval import (
    HybridSearchEngine,
    LocalSearchIndex,
    SentenceTransformerEmbedder,
)

_SUPPORTED_SUFFIXES = {".pdf", ".docx", ".txt", ".py", ".java", ".js", ".jsx"}
_DEFAULT_DATABASE = Path("data") / "search.sqlite3"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="semantic-search",
        description="Index local documents and code, then run hybrid search.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    index_parser = commands.add_parser("index", help="Extract and index files.")
    index_parser.add_argument("paths", nargs="+", type=Path)
    index_parser.add_argument("--recursive", action="store_true")
    index_parser.add_argument("--db", type=Path, default=_DEFAULT_DATABASE)
    index_parser.add_argument(
        "--model",
        default="sentence-transformers/all-MiniLM-L6-v2",
    )

    explain_parser = commands.add_parser(
        "explain",
        help="Show the compiler stages for a query.",
    )
    explain_parser.add_argument("query")

    search_parser = commands.add_parser("search", help="Search indexed chunks.")
    search_parser.add_argument("query")
    search_parser.add_argument("--db", type=Path, default=_DEFAULT_DATABASE)
    search_parser.add_argument(
        "--model",
        default="sentence-transformers/all-MiniLM-L6-v2",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "explain":
            _write_json(_compiler_output(args.query))
            return 0
        if args.command == "index":
            return _index(args.paths, args.db, args.model, args.recursive)
        if args.command == "search":
            return _search(args.query, args.db, args.model)
    except (
        CompilerError,
        ProcessingError,
        OSError,
        sqlite3.Error,
        ValueError,
    ) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2
    parser.error("Unknown command.")
    return 2


def _index(
    paths: list[Path],
    database: Path,
    model_name: str,
    recursive: bool,
) -> int:
    files = _collect_files(paths, recursive)
    if not files:
        print("No supported files found.", file=sys.stderr)
        return 2

    index = LocalSearchIndex(database)
    engine = HybridSearchEngine(index, SentenceTransformerEmbedder(model_name))
    total_chunks = 0
    try:
        for path in files:
            chunks = process_file(path)
            engine.index_file(path, chunks)
            total_chunks += len(chunks)
            print(f"{path}: {len(chunks)} chunk(s)")
    finally:
        index.close()
    print(f"Indexed {len(files)} file(s), {total_chunks} chunk(s) into {database}.")
    return 0


def _search(query: str, database: Path, model_name: str) -> int:
    compilation = compile_query(query)
    index = LocalSearchIndex(database)
    engine = HybridSearchEngine(index, SentenceTransformerEmbedder(model_name))
    try:
        results = engine.search(compilation.optimized_ir)
        output = {
            "compiler": _compiler_output(query),
            "warning": "No files are indexed yet." if index.chunk_count == 0 else None,
            "results": [result.to_dict() for result in results],
        }
    finally:
        index.close()
    _write_json(output)
    return 0


def _collect_files(paths: list[Path], recursive: bool) -> list[Path]:
    candidates: dict[str, Path] = {}
    for path in paths:
        if not path.exists():
            raise FileNotFoundError(path)
        if path.is_dir():
            entries = path.rglob("*") if recursive else path.iterdir()
            for entry in entries:
                if entry.is_file() and entry.suffix.casefold() in _SUPPORTED_SUFFIXES:
                    resolved = entry.resolve()
                    candidates[str(resolved)] = resolved
        else:
            resolved = path.resolve()
            candidates[str(resolved)] = resolved
    return [candidates[key] for key in sorted(candidates)]


def _compiler_output(query: str) -> dict[str, object]:
    result = compile_query(query)
    return {
        "query": query,
        "tokens": [token.to_dict() for token in result.tokens],
        "ast": result.ast.to_dict(),
        "ir": result.ir.to_dict(),
        "optimized_ir": result.optimized_ir.to_dict(),
    }


def _write_json(value: dict[str, object]) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
