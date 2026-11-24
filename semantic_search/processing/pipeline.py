from pathlib import Path

from .chunking import chunk_code_symbols, chunk_documents
from .code import extract_code
from .documents import extract_document
from .errors import UnsupportedFileError
from .models import SearchChunk


_DOCUMENT_SUFFIXES = {".pdf", ".docx", ".txt"}
_CODE_SUFFIXES = {".py", ".java", ".js", ".jsx"}


def process_file(path: str | Path) -> list[SearchChunk]:
    source = Path(path)
    suffix = source.suffix.casefold()
    if suffix in _DOCUMENT_SUFFIXES:
        return chunk_documents(extract_document(source))
    if suffix in _CODE_SUFFIXES:
        return chunk_code_symbols(extract_code(source))
    raise UnsupportedFileError(f"Unsupported file type: {suffix}")
