# Intelligent Query Analyzer and Search System

A compiler-assisted document and source-code search workspace. The web application is **offline-first** and runs on Vercel as a PWA. Local documents and search data are stored in browser IndexedDB; Supabase is not required.

## Features

- Seven-stage TypeScript query compiler: lexer, parser, AST, semantic checks, IR, optimization, and retrieval planning.
- Browser-side extraction and chunking for PDF, DOCX, TXT, Python, Java, JavaScript, and related source files.
- Browser-side 384-dimensional MiniLM embeddings using Transformers.js.
- Local keyword scoring and MiniLM vector similarity, combined with Reciprocal Rank Fusion (RRF).
- Private document storage, per-user document/chunk records, search history, and usage analytics.
- Local Python CLI and retrieval implementation remain available for offline experimentation; they are not part of the deployed web runtime.

## Production architecture

```text
Browser / Next.js (Vercel)
  ├── TypeScript query compiler
  ├── Document extraction + chunking
  ├── MiniLM embeddings (Transformers.js)
  └── IndexedDB local repository
        ├── Documents + extracted chunks
        ├── Storage (private documents bucket)
        ├── MiniLM embeddings
              ├── documents + document_chunks
        └── Search history + analytics

              ├── hybrid_search_rrf() RPC
              └── search_history
```

## Offline usage

Configure these Vercel environment variables in Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Connect once to download the app shell and MiniLM model. The service worker caches application assets and the model runtime caches model files. Indexed documents remain in this browser profile; clearing site data removes them. Export/restore and cross-device sync are not included yet.

Database schema and RLS are defined in `supabase/migrations`.

## Run locally

```powershell
Set-Location .\frontend
npm install
Copy-Item .env.example .env.local
# No Supabase environment variables are required.
npm run dev
```

Open http://localhost:3000. No FastAPI server, localhost API URL, or CORS setup is required.

## Local Python research tools

The `semantic_search` package retains its local compiler, processing, retrieval, and CLI modules for experiments and reproducible offline evaluation. These modules are not deployed as a web API.

Python dependencies are listed in `requirements.txt`. CLI commands:

```powershell
python -m semantic_search explain "Find Python functions that process CSV files"
python -m semantic_search index .\my_documents --recursive
python -m semantic_search search "Find Python functions that process CSV files"
```

## Checks

From `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Python CLI/core tests:

```powershell
python -m unittest discover -s tests -v
```

## Team

- Amar Jaleel
- Azhar Ali
- Faizan
- Kamran Khan
