import ast
from pathlib import Path

import tree_sitter_java
import tree_sitter_javascript
from tree_sitter import Language, Parser

from .errors import ProcessingError, UnsupportedFileError
from .identifiers import searchable_code
from .models import ExtractedBlock


_TREE_SITTER_LANGUAGES = {
    ".java": ("java", tree_sitter_java.language()),
    ".js": ("javascript", tree_sitter_javascript.language()),
    ".jsx": ("javascript", tree_sitter_javascript.language()),
}


def extract_code(path: str | Path) -> list[ExtractedBlock]:
    source_path = Path(path)
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    try:
        source = source_path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as error:
        raise ProcessingError(
            f"Source file '{source_path.name}' is not valid UTF-8."
        ) from error

    suffix = source_path.suffix.casefold()
    if suffix == ".py":
        return _extract_python(source_path, source)
    if suffix in _TREE_SITTER_LANGUAGES:
        language, grammar = _TREE_SITTER_LANGUAGES[suffix]
        return _extract_tree_sitter(source_path, source, language, grammar)
    raise UnsupportedFileError(f"Unsupported source type: {suffix}")


def _extract_python(path: Path, source: str) -> list[ExtractedBlock]:
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        location = f" at line {error.lineno}" if error.lineno is not None else ""
        raise ProcessingError(
            f"Could not parse Python file '{path.name}'{location}: {error.msg}"
        ) from error

    blocks: list[ExtractedBlock] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            code = ast.get_source_segment(source, node)
            if not code:
                continue
            symbol_kind = "class" if isinstance(node, ast.ClassDef) else "function"
            identifiers = _python_identifiers(node)
            docstring = ast.get_docstring(node) or ""
            signature = code.splitlines()[0]
            blocks.append(
                ExtractedBlock(
                    content_kind="code",
                    source_type="python",
                    file_path=str(path.resolve()),
                    display_text=code,
                    searchable_text=searchable_code(
                        node.name, signature, docstring, identifiers, code
                    ),
                    start_line=node.lineno,
                    end_line=node.end_lineno,
                    symbol_name=node.name,
                    symbol_kind=symbol_kind,
                    language="python",
                    identifiers=identifiers,
                    metadata={
                        "docstring": docstring,
                        "signature": signature,
                        "parameters": (
                            _python_parameters(node)
                            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                            else []
                        ),
                        "calls": _python_calls(node),
                    },
                )
            )

    blocks.sort(
        key=lambda block: (
            block.start_line or 0,
            0 if block.symbol_kind == "class" else 1,
            block.symbol_name or "",
        )
    )
    if not blocks and source.strip():
        blocks.append(_module_block(path, source, "python", 1, len(source.splitlines())))
    return blocks


def _python_identifiers(node: ast.AST) -> tuple[str, ...]:
    names: list[str] = []
    for child in ast.walk(node):
        value: str | None = None
        if isinstance(child, ast.Name):
            value = child.id
        elif isinstance(child, ast.Attribute):
            value = child.attr
        elif isinstance(child, ast.arg):
            value = child.arg
        elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            value = child.name
        if value and value not in names:
            names.append(value)
    return tuple(names)


def _python_parameters(node: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    args = node.args
    parameters = [argument.arg for argument in args.posonlyargs + args.args]
    if args.vararg:
        parameters.append(args.vararg.arg)
    parameters.extend(argument.arg for argument in args.kwonlyargs)
    if args.kwarg:
        parameters.append(args.kwarg.arg)
    return parameters


def _python_calls(node: ast.AST) -> list[str]:
    calls: list[str] = []
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        function = child.func
        if isinstance(function, ast.Name):
            name = function.id
        elif isinstance(function, ast.Attribute):
            name = function.attr
        else:
            continue
        if name not in calls:
            calls.append(name)
    return calls


def _extract_tree_sitter(
    path: Path,
    source: str,
    language: str,
    grammar_pointer,
) -> list[ExtractedBlock]:
    parser = Parser(Language(grammar_pointer))
    tree = parser.parse(source.encode("utf-8"))
    lines = source.splitlines()
    blocks: list[ExtractedBlock] = []
    stack = [tree.root_node]

    while stack:
        node = stack.pop()
        symbol = _tree_symbol(node, language)
        if symbol is not None:
            name, symbol_kind = symbol
            code = node.text.decode("utf-8")
            identifiers = _tree_identifiers(node)
            documentation = _preceding_comments(lines, node.start_point.row)
            signature = code.splitlines()[0]
            blocks.append(
                ExtractedBlock(
                    content_kind="code",
                    source_type=language,
                    file_path=str(path.resolve()),
                    display_text=code,
                    searchable_text=searchable_code(
                        name, signature, documentation, identifiers, code
                    ),
                    start_line=node.start_point.row + 1,
                    end_line=node.end_point.row + 1,
                    symbol_name=name,
                    symbol_kind=symbol_kind,
                    language=language,
                    identifiers=identifiers,
                    metadata={
                        "docstring": documentation,
                        "signature": signature,
                        "calls": _tree_calls(node, language),
                        "has_syntax_errors": node.has_error,
                    },
                )
            )
        stack.extend(reversed(node.children))

    blocks.sort(
        key=lambda block: (
            block.start_line or 0,
            0 if block.symbol_kind == "class" else 1,
            block.symbol_name or "",
        )
    )
    if not blocks and source.strip():
        blocks.append(
            _module_block(path, source, language, 1, max(len(lines), 1))
        )
    return blocks


def _tree_symbol(node, language: str) -> tuple[str, str] | None:
    if language == "java":
        if node.type in {
            "class_declaration",
            "interface_declaration",
            "enum_declaration",
            "record_declaration",
        }:
            symbol_kind = "class"
        elif node.type in {"method_declaration", "constructor_declaration"}:
            symbol_kind = "function"
        else:
            return None
        name_node = node.child_by_field_name("name")
    else:
        if node.type == "class_declaration":
            symbol_kind = "class"
            name_node = node.child_by_field_name("name")
        elif node.type in {
            "function_declaration",
            "generator_function_declaration",
            "method_definition",
        }:
            symbol_kind = "function"
            name_node = node.child_by_field_name("name")
        elif node.type == "variable_declarator":
            value_node = node.child_by_field_name("value")
            if value_node is None or value_node.type not in {
                "arrow_function",
                "function_expression",
            }:
                return None
            symbol_kind = "function"
            name_node = node.child_by_field_name("name")
        else:
            return None

    if name_node is None:
        return None
    return name_node.text.decode("utf-8"), symbol_kind


def _tree_identifiers(node) -> tuple[str, ...]:
    identifiers: list[str] = []
    stack = [node]
    while stack:
        current = stack.pop()
        if current.type in {
            "identifier",
            "property_identifier",
            "type_identifier",
            "field_identifier",
        }:
            name = current.text.decode("utf-8")
            if name not in identifiers:
                identifiers.append(name)
        stack.extend(reversed(current.children))
    return tuple(identifiers)


def _tree_calls(node, language: str) -> list[str]:
    calls: list[str] = []
    call_type = "method_invocation" if language == "java" else "call_expression"
    stack = [node]
    while stack:
        current = stack.pop()
        if current.type == call_type:
            name_node = (
                current.child_by_field_name("name")
                if language == "java"
                else current.child_by_field_name("function")
            )
            if name_node is not None:
                name = name_node.text.decode("utf-8")
                if name not in calls:
                    calls.append(name)
        stack.extend(reversed(current.children))
    return calls


def _preceding_comments(lines: list[str], start_row: int) -> str:
    comments: list[str] = []
    index = start_row - 1
    while index >= 0:
        line = lines[index].strip()
        if not line:
            if comments:
                break
            index -= 1
            continue
        if line.startswith(("//", "/*", "*", "*/", "///", "/**")):
            comments.append(line)
            index -= 1
            continue
        break
    return " ".join(reversed(comments))


def _module_block(
    path: Path,
    source: str,
    language: str,
    start_line: int,
    end_line: int,
) -> ExtractedBlock:
    return ExtractedBlock(
        content_kind="code",
        source_type=language,
        file_path=str(path.resolve()),
        display_text=source,
        searchable_text=searchable_code(path.stem, path.stem, "", (), source),
        start_line=start_line,
        end_line=end_line,
        symbol_name=path.stem,
        symbol_kind="module",
        language=language,
    )
