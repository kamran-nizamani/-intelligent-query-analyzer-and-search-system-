from .ast_nodes import QueryAST
from .errors import SemanticError
from .symbols import validate_symbols


class SemanticAnalyzer:
    def analyze(self, query: QueryAST) -> QueryAST:
        validate_symbols(query.target, query.language)
        if query.language is not None and query.target == "document":
            raise SemanticError(
                "A programming-language filter cannot be applied to documents."
            )
        if query.limit < 1 or query.limit > 100:
            raise SemanticError("'limit' must be between 1 and 100.")
        if not query.topic:
            raise SemanticError(
                "Add descriptive search terms, for example "
                "'find Python functions that process CSV files'."
            )
        return query
