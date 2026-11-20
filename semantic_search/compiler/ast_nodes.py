from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class QueryAST:
    action: str
    target: str | None
    language: str | None
    topic: str
    limit: int
    source_text: str

    def to_dict(self) -> dict[str, str | int | None]:
        return asdict(self)
