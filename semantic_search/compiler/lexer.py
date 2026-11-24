import re
import unicodedata

from .errors import LexicalError
from .tokens import Token, TokenKind


_TOKEN_PATTERN = re.compile(
    r'"(?P<phrase>[^"\r\n]*)"|(?P<word>[\w#+-]+)|(?P<punct>[,?.!;:()])|(?P<other>\S)',
    re.UNICODE,
)
_ACTIONS = {"find", "show", "search", "list", "get"}
_TARGETS = {
    "document": "document",
    "documents": "document",
    "note": "document",
    "notes": "document",
    "paper": "document",
    "papers": "document",
    "pdf": "document",
    "pdfs": "document",
    "code": "code",
    "function": "function",
    "functions": "function",
    "class": "class",
    "classes": "class",
    "file": "file",
    "files": "file",
}
_LANGUAGES = {
    "python": "python",
    "py": "python",
    "java": "java",
    "javascript": "javascript",
    "js": "javascript",
}
_RELATIONS = {
    "about",
    "on",
    "related",
    "to",
    "that",
    "which",
    "for",
    "responsible",
}


class Lexer:
    def tokenize(self, source: str) -> list[Token]:
        if not isinstance(source, str):
            raise LexicalError("Query must be text.")

        tokens: list[Token] = []
        for match in _TOKEN_PATTERN.finditer(source):
            value = match.group()
            if match.group("phrase") is not None:
                phrase = match.group("phrase")
                if not phrase.strip():
                    continue
                tokens.append(Token(TokenKind.PHRASE, phrase, match.start(), value))
            elif match.group("word") is not None:
                normalized = value.casefold()
                if normalized in _ACTIONS:
                    kind = TokenKind.ACTION
                elif normalized in _TARGETS:
                    kind = TokenKind.TARGET
                    value = _TARGETS[normalized]
                elif normalized in _LANGUAGES:
                    kind = TokenKind.LANGUAGE
                    value = _LANGUAGES[normalized]
                elif normalized == "limit":
                    kind = TokenKind.LIMIT
                    value = normalized
                elif normalized in _RELATIONS:
                    kind = TokenKind.RELATION
                    value = normalized
                elif normalized.isdecimal():
                    kind = TokenKind.NUMBER
                else:
                    kind = TokenKind.WORD
                tokens.append(Token(kind, value, match.start(), match.group()))
            elif match.group("other") is not None:
                if unicodedata.category(value).startswith("C"):
                    raise LexicalError(
                        f"Unsupported control character at position {match.start()}."
                    )
                tokens.append(Token(TokenKind.WORD, value, match.start(), value))

        if source.count('"') % 2:
            raise LexicalError("Quoted search phrases must have a closing quote.")

        tokens.append(Token(TokenKind.EOF, "", len(source), ""))
        return tokens
