class CompilerError(Exception):
    """Base class for expected query compilation errors."""


class LexicalError(CompilerError):
    pass


class ParseError(CompilerError):
    pass


class SemanticError(CompilerError):
    pass
