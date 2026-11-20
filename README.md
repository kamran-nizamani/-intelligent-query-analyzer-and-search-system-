# Intelligent Query Analyzer and Search System

A local-first search application that turns natural-language-style queries into
a structured search plan, indexes documents and source code, and combines
keyword and semantic retrieval. The project includes a Python compiler and
retrieval backend, a FastAPI service, and a Next.js web interface.

## Objectives and key features

- Parse supported search phrases into tokens, an AST, validated semantics, and
  an optimized intermediate representation.
- Extract and chunk PDF, DOCX, and TXT documents, plus Python, Java, JavaScript,
  and JSX source files while retaining useful source locations and identifiers.
- Search indexed content using SQLite FTS5/BM25 and FAISS vector similarity,
  combined with Reciprocal Rank Fusion (RRF).
- Provide a command-line interface for indexing files, inspecting compiled
  queries, and searching the local index.
- Provide a web workspace for search, query analysis, document management,
  search history, analytics, and settings. The frontend calls the local API and
  clearly indicates when it is unavailable.

The query compiler intentionally supports a limited search vocabulary; it is
not a general-purpose natural-language parser. The web query analyzer can use
a labelled local TypeScript approximation when the API is offline, but search
and document operations require the backend.

## Technologies

| Area | Technologies |
|---|---|
| Backend | Python, FastAPI, Pydantic, Uvicorn |
| Query compiler | Python lexer, parser, AST, semantic validation, IR, optimizer |
| Document and code processing | PyMuPDF, python-docx, Tree-sitter, Python `ast` |
| Retrieval and storage | SQLite FTS5/BM25, FAISS CPU, Sentence Transformers (`all-MiniLM-L6-v2`), NumPy, RRF |
| Frontend | Next.js 15, React 19, TypeScript |
| Frontend tests | Vitest, Testing Library, Playwright, axe-core |
| Backend tests | Python `unittest` |

Python dependencies are listed in [requirements.txt](./requirements.txt);
frontend dependencies and scripts are in [frontend/package.json](./frontend/package.json).

## Architecture

```text
Browser (Next.js / React)
        │ HTTP
        ▼
FastAPI service ─────── CLI
        │                 │
        ├── Query compiler: lexer → parser/AST → semantic analysis → IR → optimizer
        ├── File processing: document/code extraction → source-aware chunks
        └── Hybrid retrieval
              ├── SQLite FTS5/BM25 lexical search and metadata
              ├── Sentence Transformer embeddings + FAISS vector search
              └── Reciprocal Rank Fusion → ranked, source-aware results
```

The API and CLI share the compiler, processing pipeline, and local retrieval
implementation. Runtime database files and uploaded documents are stored under
`data/` and are intentionally not committed.

## Project layout

```text
semantic_search/
  compiler/       Query lexer, parser, AST, semantic checks, IR, optimizer
  processing/     Document/code extraction and chunking
  retrieval/      SQLite/FAISS indexes, embeddings, hybrid search and RRF
  api/            FastAPI application and seed utilities
  cli.py          Index, explain, and search commands
frontend/
  src/            Next.js application, views, components, API client
  tests/          Vitest component/unit tests and Playwright E2E tests
tests/
  fixtures/       Small test documents and source-code fixtures
  test_*.py       Compiler, processing, retrieval, and integration tests
```

## Requirements and setup

- Python 3.10 or later
- Node.js and npm (use a Node.js release supported by Next.js 15)
- Internet access on first semantic search to download the
  `sentence-transformers/all-MiniLM-L6-v2` model; the model is cached by
  Sentence Transformers and is not included in this repository

From the project root, create and activate a virtual environment and install
the backend dependencies (PowerShell):

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Install frontend dependencies in a separate terminal:

```powershell
Set-Location .\frontend
npm install
```

The frontend uses `http://localhost:8000` as its default API URL. To override
it, copy `frontend/.env.example` to `frontend/.env.local` and set
`NEXT_PUBLIC_API_BASE_URL`. Local environment files are ignored by Git.

## Run the application

Start the API from the project root:

```powershell
python -m uvicorn semantic_search.api.app:app --host 127.0.0.1 --port 8000
```

In another terminal, start the frontend:

```powershell
Set-Location .\frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API health check is
available at [http://localhost:8000/api/health](http://localhost:8000/api/health).
The first semantic search may take longer while the embedding model loads.

## CLI usage

Run commands from the project root. Add `--recursive` to index subdirectories;
supported inputs are PDF, DOCX, TXT, Python, Java, JavaScript, and JSX.

```powershell
# Index files and directories into data/search.sqlite3
python -m semantic_search index .\my_documents --recursive

# Inspect the compiler output without searching
python -m semantic_search explain "Find Python functions that process CSV files"

# Search the local index
python -m semantic_search search "Find Python functions that process CSV files"
```

Use `--db <path>` with `index` or `search` to select a different local SQLite
database. The default database, uploaded files, and SQLite sidecar files are
runtime data and are not tracked.

## Tests and checks

Run backend tests from the project root:

```powershell
python -m unittest discover -s tests -v
```

Run frontend checks from `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

End-to-end tests use Playwright; see [frontend/README.md](./frontend/README.md)
for browser requirements, live-backend test behavior, and the full
`npm run test:all` command.

## Team

- Amar Jaleel
- Azhar Ali
- Faizan
- Kamran Khan
