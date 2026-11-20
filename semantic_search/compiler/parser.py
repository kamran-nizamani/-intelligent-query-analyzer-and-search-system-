from .ast_nodes import QueryAST
from .errors import ParseError
from .tokens import Token, TokenKind


class Parser:
    def parse(self, tokens: list[Token], source_text: str) -> QueryAST:
        action: str | None = None
        target: str | None = None
        language: str | None = None
        limit = 10
        topic_parts: list[str] = []
        index = 0

        while index < len(tokens):
            token = tokens[index]
            if token.kind == TokenKind.EOF:
                break
            if token.kind == TokenKind.ACTION:
                if action is not None:
                    raise ParseError(f"Unexpected second action '{token.value}'.")
                action = token.value.casefold()
            elif token.kind == TokenKind.TARGET:
                if target is None or target == "file":
                    target = token.value
                elif token.value == "file":
                    topic_parts.append(token.lexeme or token.value)
                elif target == token.value:
                    pass
                else:
                    raise ParseError(
                        "A query can specify only one target type; "
                        f"found both '{target}' and '{token.value}'."
                    )
            elif token.kind == TokenKind.LANGUAGE:
                if language is not None and language != token.value:
                    raise ParseError(
                        "A query can specify only one programming language; "
                        f"found both '{language}' and '{token.value}'."
                    )
                language = token.value
            elif token.kind == TokenKind.LIMIT:
                index += 1
                if index >= len(tokens) or tokens[index].kind != TokenKind.NUMBER:
                    raise ParseError("'limit' must be followed by a whole number.")
                limit = int(tokens[index].value)
            elif token.kind in {TokenKind.WORD, TokenKind.PHRASE}:
                topic_parts.append(token.value)
            elif token.kind == TokenKind.NUMBER:
                topic_parts.append(token.value)
            index += 1

        topic = " ".join(part for part in topic_parts if part).strip()
        return QueryAST(
            action=action or "find",
            target=target,
            language=language,
            topic=topic,
            limit=limit,
            source_text=source_text,
        )
