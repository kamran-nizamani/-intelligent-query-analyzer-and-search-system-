from dataclasses import dataclass
from enum import Enum


class TokenKind(str, Enum):
    ACTION = "ACTION"
    TARGET = "TARGET"
    LANGUAGE = "LANGUAGE"
    RELATION = "RELATION"
    LIMIT = "LIMIT"
    NUMBER = "NUMBER"
    WORD = "WORD"
    PHRASE = "PHRASE"
    EOF = "EOF"


@dataclass(frozen=True)
class Token:
    kind: TokenKind
    value: str
    position: int
    lexeme: str = ""

    def to_dict(self) -> dict[str, str | int]:
        return {
            "kind": self.kind.value,
            "value": self.value,
            "position": self.position,
            "lexeme": self.lexeme,
        }
