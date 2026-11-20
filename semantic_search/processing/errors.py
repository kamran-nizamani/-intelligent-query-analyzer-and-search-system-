class ProcessingError(Exception):
    """Raised when a supported file cannot be safely processed."""


class UnsupportedFileError(ProcessingError):
    pass
