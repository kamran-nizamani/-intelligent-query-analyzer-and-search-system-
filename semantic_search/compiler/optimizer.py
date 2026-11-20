from dataclasses import replace

from .ir import QueryIR


def optimize_ir(ir: QueryIR) -> QueryIR:
    normalized_filters = {
        key: value.casefold() for key, value in sorted(ir.filters.items())
    }
    normalized_topic = " ".join(ir.lexical_query.split())
    return replace(
        ir,
        filters=normalized_filters,
        lexical_query=normalized_topic,
        semantic_query=" ".join(ir.semantic_query.split()),
    )
