from dataclasses import dataclass

from .ast_nodes import QueryAST
from .ir import QueryIR, generate_ir
from .lexer import Lexer
from .optimizer import optimize_ir
from .parser import Parser
from .semantic import SemanticAnalyzer
from .tokens import Token


@dataclass(frozen=True)
class CompilationResult:
    tokens: list[Token]
    ast: QueryAST
    ir: QueryIR
    optimized_ir: QueryIR


def compile_query(source_text: str) -> CompilationResult:
    tokens = Lexer().tokenize(source_text)
    ast = Parser().parse(tokens, source_text)
    ast = SemanticAnalyzer().analyze(ast)
    ir = generate_ir(ast)
    optimized_ir = optimize_ir(ir)
    return CompilationResult(tokens, ast, ir, optimized_ir)
