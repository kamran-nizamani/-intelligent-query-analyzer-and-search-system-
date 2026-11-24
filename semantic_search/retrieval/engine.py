import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from semantic_search.compiler.ir import QueryIR
from semantic_search.processing.models import SearchChunk

from .embeddings import EmbeddingModel
from .interfaces import SearchIndex
from .models import RetrievalHit, SearchResult


@dataclass
class _FusionEntry:
    chunk: SearchChunk
    score: float = 0.0
    lexical_rank: int | None = None
    vector_rank: int | None = None
    lexical_score: float | None = None
    vector_score: float | None = None


class HybridSearchEngine:
    def __init__(
        self,
        index: SearchIndex,
        embedder: EmbeddingModel,
        rrf_k: int = 60,
    ) -> None:
        if rrf_k < 1:
            raise ValueError("RRF k must be a positive integer.")
        self.index = index
        self.embedder = embedder
        self.rrf_k = rrf_k

    def index_chunks(self, chunks: list[SearchChunk]) -> None:
        if not chunks:
            return
        embeddings = self.embedder.encode([chunk.text_content for chunk in chunks])
        self.index.add_chunks(chunks, embeddings)

    def index_file(self, file_path: str | Path, chunks: list[SearchChunk]) -> None:
        embeddings = (
            self.embedder.encode([chunk.text_content for chunk in chunks])
            if chunks
            else np.empty((0, 0), dtype=np.float32)
        )
        self.index.replace_file_chunks(
            str(Path(file_path).resolve()),
            chunks,
            embeddings,
        )

    def search(self, query: QueryIR) -> list[SearchResult]:
        if query.operation != "HYBRID_SEARCH":
            raise ValueError(f"Unsupported query operation '{query.operation}'.")
        if query.limit < 1 or query.limit > 100:
            raise ValueError("Search limit must be between 1 and 100.")
        if self.index.chunk_count == 0:
            return []

        candidate_count = min(max(query.limit * 5, 20), self.index.chunk_count)
        lexical_hits = self.index.lexical_search(
            query.lexical_query,
            query.filters,
            candidate_count,
        )
        query_embedding = self.embedder.encode([query.semantic_query])
        if query_embedding.ndim != 2 or query_embedding.shape[0] != 1:
            raise ValueError("Embedding model must return one vector for one query.")
        vector_hits = self.index.vector_search(
            query_embedding[0],
            query.filters,
            candidate_count,
        )
        return reciprocal_rank_fusion(
            lexical_hits,
            vector_hits,
            query.semantic_query,
            query.limit,
            self.rrf_k,
        )


def reciprocal_rank_fusion(
    lexical_hits: list[RetrievalHit],
    vector_hits: list[RetrievalHit],
    query: str,
    limit: int = 10,
    k: int = 60,
) -> list[SearchResult]:
    if limit < 1 or k < 1:
        raise ValueError("Result limit and RRF k must be positive integers.")
    entries: dict[str, _FusionEntry] = {}

    for rank, hit in enumerate(lexical_hits, start=1):
        entry = entries.setdefault(hit.chunk.chunk_id, _FusionEntry(hit.chunk))
        entry.score += 1.0 / (k + rank)
        entry.lexical_rank = rank
        entry.lexical_score = hit.score
    for rank, hit in enumerate(vector_hits, start=1):
        entry = entries.setdefault(hit.chunk.chunk_id, _FusionEntry(hit.chunk))
        entry.score += 1.0 / (k + rank)
        entry.vector_rank = rank
        entry.vector_score = hit.score

    ordered = sorted(
        entries.values(),
        key=lambda entry: (
            -entry.score,
            min(
                rank
                for rank in (entry.lexical_rank, entry.vector_rank)
                if rank is not None
            ),
            entry.chunk.chunk_id,
        ),
    )
    return [
        SearchResult(
            chunk=entry.chunk,
            rrf_score=entry.score,
            lexical_rank=entry.lexical_rank,
            vector_rank=entry.vector_rank,
            lexical_score=entry.lexical_score,
            vector_score=entry.vector_score,
            snippet=create_snippet(entry.chunk.display_content, query),
            explanation=_explanation(entry),
        )
        for entry in ordered[:limit]
    ]


def create_snippet(text: str, query: str, max_characters: int = 240) -> str:
    if len(text) <= max_characters:
        return text
    terms = [term for term in re.findall(r"[\w#+-]+", query, re.UNICODE) if term]
    occurrences = [
        match.start()
        for term in terms
        if (match := re.search(re.escape(term), text, re.IGNORECASE)) is not None
    ]
    match_position = min(occurrences, default=0)
    start = max(0, match_position - max_characters // 3)
    end = min(len(text), start + max_characters)
    if end == len(text):
        start = max(0, end - max_characters)
    snippet = text[start:end]
    if start:
        snippet = "..." + snippet
    if end < len(text):
        snippet += "..."
    return snippet


def _explanation(entry: _FusionEntry) -> tuple[str, ...]:
    details: list[str] = []
    if entry.lexical_rank is not None:
        details.append(f"Lexical rank {entry.lexical_rank}")
    if entry.vector_rank is not None:
        details.append(f"Semantic rank {entry.vector_rank}")
    return tuple(details)
