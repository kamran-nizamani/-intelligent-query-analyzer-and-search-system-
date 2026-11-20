from .errors import SemanticError


SUPPORTED_LANGUAGES = frozenset({"python", "java", "javascript"})
SUPPORTED_TARGETS = frozenset({"document", "code", "function", "class", "file"})


def validate_symbols(target: str | None, language: str | None) -> None:
    if target is not None and target not in SUPPORTED_TARGETS:
        raise SemanticError(f"Unsupported search target '{target}'.")
    if language is not None and language not in SUPPORTED_LANGUAGES:
        raise SemanticError(f"Unsupported programming language '{language}'.")
