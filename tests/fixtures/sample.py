class CsvReader:
    """Reads rows from a comma-separated file."""

    def read_csv(self, path):
        return parse_csv(path)


def parse_csv(path):
    """Parse comma-separated values into rows."""
    return open(path, encoding="utf-8").read().splitlines()
