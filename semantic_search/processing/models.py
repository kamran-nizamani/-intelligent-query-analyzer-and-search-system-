from dataclasses import dataclass, field


@dataclass(frozen=True)
class ExtractedBlock:
    content_kind: str
    source_type: str
    file_path: str
    display_text: str
    searchable_text: str
    page_number: int | None = None
    section: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    symbol_name: str | None = None
    symbol_kind: str | None = None
    language: str | None = None
    identifiers: tuple[str, ...] = ()
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class SearchChunk:
    chunk_id: str
    content_kind: str
    source_type: str
    file_path: str
    text_content: str
    display_content: str
    page_number: int | None = None
    section: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    symbol_name: str | None = None
    symbol_kind: str | None = None
    language: str | None = None
    identifiers: tuple[str, ...] = ()
    metadata: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return {
            "chunk_id": self.chunk_id,
            "content_kind": self.content_kind,
            "source_type": self.source_type,
            "file_path": self.file_path,
            "text_content": self.text_content,
            "display_content": self.display_content,
            "page_number": self.page_number,
            "section": self.section,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "symbol_name": self.symbol_name,
            "symbol_kind": self.symbol_kind,
            "language": self.language,
            "identifiers": list(self.identifiers),
            "metadata": self.metadata,
        }
