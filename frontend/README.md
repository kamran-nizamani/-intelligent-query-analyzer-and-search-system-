# Frontend: Intelligent Query Analyzer & Search System

Next.js 15 / React 19 / TypeScript app. It is a client of the FastAPI service in
`../semantic_search/api/app.py`, which wraps the Python compiler and the local
hybrid search engine (SQLite FTS5 + FAISS, fused with Reciprocal Rank Fusion).

> **Status:** the frontend is wired to the real backend. There is no mock search
> data. When the backend is unreachable the UI says so (banner + "Offline"
> status) and shows "unavailable" instead of inventing results or numbers.

## Run it

Start the backend (from the repository root, with the project's virtualenv):

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn semantic_search.api.app:app --port 8000
```

Start the frontend:

```powershell
Set-Location .\frontend
npm install
npm run dev          # http://localhost:3000
```

The API address comes from `NEXT_PUBLIC_API_BASE_URL` (see `.env.example`;
default `http://localhost:8000`). The first search or upload downloads and loads
the MiniLM embedding model, so it can take several seconds.

## Scripts

| Command | What it does |
|---|---|
| `npm run lint` | ESLint (`next/core-web-vitals` + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest + Testing Library unit/component tests (no network needed) |
| `npm run build` | Production build |
| `npm run test:e2e` | Playwright against a production build, on 4 viewports (needs Google Chrome; `npm run build` first) |
| `npm run test:all` | Everything above, in order |

The `live-backend` Playwright spec drives the real API. It has real side
effects (a few search-history rows, plus one temporary uploaded file that the
test deletes) and is skipped automatically if the API is not running. It runs
on the desktop project only.

## What is real and what is not

| Feature | Status |
|---|---|
| Search (hybrid / semantic / keyword), results, quick preview | **Backend-connected** |
| Compiler trace in the Search view, Query Analyzer, Compiler Pipeline | **Backend-connected** (`/api/compiler/explain`) |
| Document upload, listing, deletion | **Backend-connected** (client validates type, 0 bytes and 20 MB first) |
| Search history (list, re-run, clear) | **Backend-connected** |
| Analytics: counts, average server time, searches per mode | **Backend-connected** |
| Result filtering by kind / file type, sort by score or title | **Frontend only**, applied to the results returned |
| Settings (theme, density, default mode, results per query, highlighting, voice, trace drawer) | **Frontend only**, saved in `localStorage` |
| Voice input | Browser Web Speech API (Chrome/Edge). Audio handling is the browser's; nothing is sent to this backend |
| Query Analyzer/Pipeline when the backend is down | A **local TypeScript approximation** (`src/lib/compiler-engine.ts`), always labelled as such |

### Known limitations (backend-side, not changeable from here)

- `/api/analytics` returns **fixed constants** for Precision@1/5, Recall@5 and
  MRR (and 16.4 ms when there is no latency data). The UI deliberately does
  not display them; the Analytics page says retrieval quality is *not measured
  yet* until a labelled evaluation set exists.
- `/api/compiler/explain` reports **nominal** per-stage durations (0.4, 0.8 ms,
  …). The Pipeline view prefixes them with `~` / "Nominal" and shows the one
  measured total next to it.
- Search results carry no timestamp, so there is no "most recent" sort.
- The server filters `kind`/`type` itself, but the UI filters the returned
  results locally, so "N of M" can only refer to results already fetched.
- Searching for very short queries (e.g. "Find Java classes") is rejected by the
  compiler with "Add descriptive search terms…"; the UI shows that message as is.

## Layout

```
src/
  app/                  layout, globals.css (design tokens, light/dark themes)
  components/
    search-workspace.tsx  app state: backend data, settings, search lifecycle
    shell/                sidebar, header, command palette, offline banner
    views/                one file per page
    modals/ ui/           preview dialog, toast, trace-source notice
  lib/
    api-client.ts         the only place that talks to the backend (typed, with timeouts)
    upload-validation.ts  client-side pre-checks
    use-dialog.ts         focus trap / Escape / focus return for modals
    highlight.tsx         query-term highlighting
    compiler-engine.ts    offline approximation of the compiler (fallback only)
  data/example-queries.ts suggested prompts (inputs only, never results)
  types/search.ts         shared types mirroring the API responses
tests/
  unit/                 Vitest + Testing Library
  e2e/                  Playwright (+ axe-core accessibility scans)
```
