import re


def split_identifier(identifier: str) -> str:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", identifier)
    return re.sub(r"[_\s]+", " ", spaced).strip()


def searchable_code(
    symbol_name: str,
    signature: str,
    documentation: str,
    identifiers: tuple[str, ...],
    source: str,
) -> str:
    parts = [
        symbol_name,
        split_identifier(symbol_name),
        signature,
        documentation,
        " ".join(split_identifier(item) for item in identifiers),
        source,
    ]
    return "\n".join(part for part in parts if part)
