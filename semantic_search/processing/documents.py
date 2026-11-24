from pathlib import Path

import pymupdf
from docx import Document
from docx.opc.exceptions import PackageNotFoundError
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from .errors import ProcessingError, UnsupportedFileError
from .models import ExtractedBlock


def extract_document(path: str | Path) -> list[ExtractedBlock]:
    source = Path(path)
    if not source.is_file():
        raise FileNotFoundError(source)

    extractors = {
        ".pdf": _extract_pdf,
        ".docx": _extract_docx,
        ".txt": _extract_txt,
    }
    extractor = extractors.get(source.suffix.casefold())
    if extractor is None:
        raise UnsupportedFileError(f"Unsupported document type: {source.suffix}")
    return extractor(source)


def _extract_pdf(path: Path) -> list[ExtractedBlock]:
    try:
        document = pymupdf.open(path)
    except (pymupdf.FileDataError, RuntimeError) as error:
        raise ProcessingError(f"Could not open PDF '{path.name}': {error}") from error

    blocks: list[ExtractedBlock] = []
    with document:
        if document.is_encrypted:
            raise ProcessingError(f"Encrypted PDF is not supported: '{path.name}'.")
        for page_number, page in enumerate(document, start=1):
            page_text = page.get_text("text")
            if page_text.strip():
                blocks.append(
                    ExtractedBlock(
                        content_kind="document",
                        source_type="pdf",
                        file_path=str(path.resolve()),
                        display_text=page_text,
                        searchable_text=page_text,
                        page_number=page_number,
                    )
                )
    return blocks


def _iter_docx_blocks(document):
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def _extract_docx(path: Path) -> list[ExtractedBlock]:
    try:
        document = Document(path)
    except PackageNotFoundError as error:
        raise ProcessingError(f"Could not open DOCX '{path.name}': {error}") from error

    blocks: list[ExtractedBlock] = []
    section: str | None = None
    paragraph_number = 0
    table_number = 0

    for item in _iter_docx_blocks(document):
        if isinstance(item, Paragraph):
            paragraph_number += 1
            text = item.text.strip()
            if not text:
                continue
            if item.style and item.style.name.startswith("Heading"):
                section = text
            blocks.append(
                ExtractedBlock(
                    content_kind="document",
                    source_type="docx",
                    file_path=str(path.resolve()),
                    display_text=text,
                    searchable_text=text,
                    section=section,
                    metadata={"paragraph_number": paragraph_number},
                )
            )
        else:
            table_number += 1
            for row_number, row in enumerate(item.rows, start=1):
                text = " | ".join(
                    cell.text.strip().replace("\n", " ")
                    for cell in row.cells
                    if cell.text.strip()
                )
                if text:
                    blocks.append(
                        ExtractedBlock(
                            content_kind="document",
                            source_type="docx",
                            file_path=str(path.resolve()),
                            display_text=text,
                            searchable_text=text,
                            section=section,
                            metadata={
                                "table_number": table_number,
                                "row_number": row_number,
                            },
                        )
                    )
    return blocks


def _extract_txt(path: Path) -> list[ExtractedBlock]:
    try:
        text = path.read_text(encoding="utf-8-sig")
        encoding = "utf-8"
    except UnicodeDecodeError:
        try:
            text = path.read_text(encoding="cp1252")
            encoding = "cp1252"
        except UnicodeDecodeError as error:
            raise ProcessingError(
                f"Text file '{path.name}' is not valid UTF-8 or Windows-1252."
            ) from error

    blocks: list[ExtractedBlock] = []
    lines = text.splitlines()
    start_line: int | None = None
    paragraph_lines: list[str] = []

    def add_paragraph() -> None:
        if start_line is None or not paragraph_lines:
            return
        paragraph = "\n".join(paragraph_lines)
        blocks.append(
            ExtractedBlock(
                content_kind="document",
                source_type="txt",
                file_path=str(path.resolve()),
                display_text=paragraph,
                searchable_text=paragraph,
                start_line=start_line,
                end_line=start_line + len(paragraph_lines) - 1,
                metadata={"encoding": encoding},
            )
        )

    for line_number, line in enumerate(lines, start=1):
        if line.strip():
            if start_line is None:
                start_line = line_number
            paragraph_lines.append(line)
        else:
            add_paragraph()
            start_line = None
            paragraph_lines = []
    add_paragraph()
    return blocks
