# Frontend: Intelligent Query Analyzer & Search System

Next.js 15 / React 19 / TypeScript UI with two supported data paths:

- **Hosted Supabase mode:** enabled when `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured. The browser extracts
  documents/code, generates MiniLM embeddings, stores files in Supabase
  Storage, and queries PostgreSQL full-text search + pgvector.
- **Local FastAPI mode:** used when Supabase is not configured. The UI calls
  `../semantic_search/api/app.py`, which uses the Python compiler and local
  SQLite FTS5/FAISS retrieval engine.

The UI does not invent search results when its configured backend is offline.
The hosted compiler trace is a labelled TypeScript approximation; database
search execution and its measured latency are separate operations.

## Run it

For local FastAPI mode, start the backend from the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn semantic_search.api.app:app --port 8000
```

Then start the frontend:

```powershell
Set-Location .\frontend
npm install
npm run dev
```

Open http://localhost:3000. The API address comes from
`NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`).

For hosted mode, configure `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in the frontend environment. When both are
present, Supabase mode takes precedence over the local API. Never put a
service-role key in a `NEXT_PUBLIC_*` variable.

The first semantic search or upload may be slower while the browser downloads
and initializes the quantized `Xenova/all-MiniLM-L6-v2` model. The model is
cached by the browser for subsequent use. Document chunk embeddings are
generated in small batches to reduce per-chunk inference overhead.

## Scripts

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Vitest + Testing Library unit/component tests |
| `npm run build` | Next.js production build |
| `npm run test:e2e` | Playwright against a production build |
| `npm run test:all` | Lint, types, unit tests, build, and E2E |

The live-backend Playwright spec targets the local FastAPI service on port
8000. It creates temporary search history and one temporary upload, then
deletes the uploaded file. It is skipped when the local API is unavailable.

## Feature status

| Feature | Hosted Supabase mode | Local FastAPI mode |
|---|---|---|
| Hybrid / semantic / keyword search | PostgreSQL FTS + pgvector + RRF | SQLite FTS5 + FAISS + RRF |
| PDF, DOCX, TXT, Python, Java, JS, JSX uploads | Browser extraction, Storage, chunk rows | FastAPI processing pipeline |
| File list and deletion | Database + Storage cleanup | Local index and file handling |
| Search history | Supabase table with per-user RLS | Local backend history |
| Analytics | Database aggregates; no full history download | Backend analytics endpoint |
| Kind and file-type filters | Applied before database ranking | Applied by the API |
| Compiler trace | Local TypeScript approximation | Python compiler endpoint |
| Theme, density, defaults, highlighting | Browser localStorage | Browser localStorage |
| Voice input | Browser Web Speech API | Browser Web Speech API |

## Known limitations

- Retrieval quality metrics (Precision@k, Recall@k, MRR) are **not measured**.
  They require a labelled evaluation dataset and repeatable benchmark runs;
  the Analytics view intentionally does not display fabricated scores.
- The hosted browser embedder downloads its model on first use. Later sessions
  can use the browser cache; low-memory devices may fall back from batched
  inference to one chunk at a time.
- The local Python backend and hosted Supabase path are distinct deployments.
  Changing one does not automatically change the other.
- The Query Analyzer's local TypeScript trace is explanatory, not a measured
  trace of PostgreSQL execution. Search latency is measured separately.

## Layout

```
src/
  app/                    layout and design tokens
  components/
    search-workspace.tsx  app state and search lifecycle
    shell/                sidebar, header, command palette
    views/                one file per page
    modals/ ui/           preview dialog, toast, trace notices
  lib/
    api-client.ts         Supabase and FastAPI client paths
    upload-validation.ts  client-side file checks
    embeddings/           browser MiniLM embedding pipeline
    extractors/           browser document and code extraction
    compiler-engine.ts    local TypeScript query-plan approximation
  types/search.ts         shared UI/API types
tests/
  unit/                   Vitest + Testing Library
  e2e/                    Playwright + axe-core
```
