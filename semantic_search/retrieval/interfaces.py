from typing import Protocol
from pathlib import Path

import numpy as np

from semantic_search.processing.models import SearchChunk

from .models import RetrievalHit


class SearchIndex(Protocol):
    @property
    def chunk_count(self) -> int:
        ...

    def add_chunks(self, chunks: list[SearchChunk], vectors: np.ndarray) -> None:
        ...

    def delete_chunks(self, chunk_ids: list[str]) -> None:
        ...

    def replace_file_chunks(
        self,
        file_path: str | Path,
        chunks: list[SearchChunk],
        vectors: np.ndarray,
    ) -> None:
        ...

    def lexical_search(
        self,
        query: str,
        filters: dict[str, str],
        limit: int,
    ) -> list[RetrievalHit]:
        ...

    def vector_search(
        self,
        vector: np.ndarray,
        filters: dict[str, str],
        limit: int,
    ) -> list[RetrievalHit]:
        ...
