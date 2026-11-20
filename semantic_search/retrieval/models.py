from dataclasses import dataclass

from semantic_search.processing.models import SearchChunk


@dataclass(frozen=True)
class RetrievalHit:
    chunk: SearchChunk
    score: float


@dataclass(frozen=True)
class SearchResult:
    chunk: SearchChunk
    rrf_score: float
    lexical_rank: int | None
    vector_rank: int | None
    lexical_score: float | None
    vector_score: float | None
    snippet: str
    explanation: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "chunk": self.chunk.to_dict(),
            "rrf_score": self.rrf_score,
            "lexical_rank": self.lexical_rank,
            "vector_rank": self.vector_rank,
            "lexical_score": self.lexical_score,
            "vector_score": self.vector_score,
            "snippet": self.snippet,
            "explanation": list(self.explanation),
        }
