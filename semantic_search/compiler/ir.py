from dataclasses import asdict, dataclass

from .ast_nodes import QueryAST


@dataclass(frozen=True)
class QueryIR:
    operation: str
    filters: dict[str, str]
    lexical_query: str
    semantic_query: str
    limit: int
    fusion: str

    def to_dict(self) -> dict[str, str | int | dict[str, str]]:
        return asdict(self)


def generate_ir(query: QueryAST) -> QueryIR:
    filters: dict[str, str] = {}
    if query.target == "document":
        filters["content_kind"] = "document"
    elif query.target in {"code", "function", "class"}:
        filters["content_kind"] = "code"
    if query.target in {"function", "class"}:
        filters["symbol_kind"] = query.target
    if query.language is not None:
        filters["language"] = query.language

    return QueryIR(
        operation="HYBRID_SEARCH",
        filters=filters,
        lexical_query=query.topic,
        semantic_query=query.topic,
        limit=query.limit,
        fusion="rrf",
    )
