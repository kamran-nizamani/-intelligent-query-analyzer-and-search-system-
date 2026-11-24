import re
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

from .identifiers import searchable_code
from .models import ExtractedBlock, SearchChunk


@dataclass(frozen=True)
class _WordRef:
    word: str
    block: ExtractedBlock
    start: int
    end: int


def chunk_documents(
    blocks: list[ExtractedBlock],
    max_words: int = 180,
    overlap_words: int = 30,
) -> list[SearchChunk]:
    _validate_chunk_sizes(max_words, overlap_words)
    grouped_blocks: list[list[ExtractedBlock]] = []
    for block in blocks:
        boundary = (block.page_number, block.section)
        if (
            not grouped_blocks
            or (grouped_blocks[-1][-1].page_number, grouped_blocks[-1][-1].section)
            != boundary
        ):
            grouped_blocks.append([])
        grouped_blocks[-1].append(block)

    chunks: list[SearchChunk] = []
    for group in grouped_blocks:
        word_refs = [
            _WordRef(match.group(), block, match.start(), match.end())
            for block in group
            for match in re.finditer(r"\S+", block.searchable_text)
        ]
        step = max_words - overlap_words
        for chunk_index, start in enumerate(range(0, len(word_refs), step)):
            selected = word_refs[start : start + max_words]
            if not selected:
                continue
            chunks.append(_document_chunk(selected, chunk_index))
            if start + max_words >= len(word_refs):
                break
    return chunks


def chunk_code_symbols(
    blocks: list[ExtractedBlock],
    max_lines: int = 250,
    overlap_lines: int = 20,
) -> list[SearchChunk]:
    _validate_chunk_sizes(max_lines, overlap_lines)
    chunks: list[SearchChunk] = []
    step = max_lines - overlap_lines

    for block in blocks:
        lines = block.display_text.splitlines()
        if not lines:
            continue
        for part, start in enumerate(range(0, len(lines), step), start=1):
            selected = lines[start : start + max_lines]
            start_line = (block.start_line or 1) + start
            end_line = start_line + len(selected) - 1
            metadata = dict(block.metadata)
            if len(lines) > max_lines:
                metadata["chunk_part"] = part
            display_content = "\n".join(selected)
            text_content = searchable_code(
                block.symbol_name or Path(block.file_path).stem,
                str(metadata.get("signature", "")),
                str(metadata.get("docstring", "")),
                block.identifiers,
                display_content,
            )
            chunk = SearchChunk(
                chunk_id=_chunk_id(
                    block,
                    display_content,
                    start_line,
                    end_line,
                ),
                content_kind=block.content_kind,
                source_type=block.source_type,
                file_path=block.file_path,
                text_content=text_content,
                display_content=display_content,
                start_line=start_line,
                end_line=end_line,
                symbol_name=block.symbol_name,
                symbol_kind=block.symbol_kind,
                language=block.language,
                identifiers=block.identifiers,
                metadata=metadata,
            )
            chunks.append(chunk)
            if start + max_lines >= len(lines):
                break
    return chunks


def _document_chunk(
    selected: list[_WordRef],
    chunk_index: int,
) -> SearchChunk:
    words = [word.word for word in selected]
    blocks = list({id(word.block): word.block for word in selected}.values())
    first = blocks[0]
    text_ranges: dict[int, tuple[ExtractedBlock, int, int]] = {}
    line_numbers: list[int] = []
    for word in selected:
        key = id(word.block)
        if key in text_ranges:
            block, start, end = text_ranges[key]
            text_ranges[key] = (block, min(start, word.start), max(end, word.end))
        else:
            text_ranges[key] = (word.block, word.start, word.end)
        if word.block.start_line is not None:
            line_numbers.extend(
                (
                    word.block.start_line
                    + word.block.display_text[: word.start].count("\n"),
                    word.block.start_line
                    + word.block.display_text[: max(word.end - 1, word.start)].count("\n"),
                )
            )
    metadata = dict(first.metadata)
    metadata["source_block_count"] = len(blocks)
    metadata["source_metadata"] = [dict(block.metadata) for block in blocks]
    display_content = "\n\n".join(
        block.display_text[start:end]
        for block, start, end in text_ranges.values()
    )
    text_content = " ".join(words)
    start_line = min(line_numbers) if line_numbers else None
    end_line = max(line_numbers) if line_numbers else None
    return SearchChunk(
        chunk_id=_chunk_id(first, display_content, start_line, end_line, chunk_index),
        content_kind=first.content_kind,
        source_type=first.source_type,
        file_path=first.file_path,
        text_content=text_content,
        display_content=display_content,
        page_number=first.page_number,
        section=first.section,
        start_line=start_line,
        end_line=end_line,
        metadata=metadata,
    )


def _chunk_id(
    block: ExtractedBlock,
    content: str,
    start_line: int | None,
    end_line: int | None,
    part: int = 0,
) -> str:
    identity = "\0".join(
        (
            block.file_path,
            block.source_type,
            str(block.page_number),
            str(start_line),
            str(end_line),
            str(part),
            block.symbol_name or "",
            content,
        )
    )
    return sha256(identity.encode("utf-8")).hexdigest()


def _validate_chunk_sizes(max_size: int, overlap: int) -> None:
    if max_size < 1:
        raise ValueError("Chunk size must be at least one.")
    if overlap < 0 or overlap >= max_size:
        raise ValueError("Chunk overlap must be non-negative and smaller than chunk size.")
