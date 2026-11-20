import json

from .pipeline import compile_query


def main() -> None:
    query = "Find Python functions that process CSV files"
    result = compile_query(query)
    output = {
        "query": query,
        "tokens": [token.to_dict() for token in result.tokens],
        "ast": result.ast.to_dict(),
        "ir": result.ir.to_dict(),
        "optimized_ir": result.optimized_ir.to_dict(),
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
