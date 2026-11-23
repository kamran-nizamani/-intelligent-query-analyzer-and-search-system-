# Intelligent Query Analyzer — Frontend

Next.js 15 / React 19 / TypeScript. The deployed application is **offline-first**: document data, embeddings, and search history live in browser IndexedDB; no API host or Supabase project is required.

## Architecture

- **Vercel:** hosts the Next.js application.
- **Local persistence:** IndexedDB stores documents, extracted chunks, embeddings, and search history per browser.
- **Private by browser profile:** local data stays in the current browser profile unless exported.
- **Local analytics:** computed from IndexedDB records.
- **Local hybrid retrieval:** keyword scoring + MiniLM cosine similarity + Reciprocal Rank Fusion.
- **Browser:** extracts PDF/DOCX/TXT and source code, runs the TypeScript query compiler, and generates 384-dimensional MiniLM embeddings with Transformers.js.

## Environment variables

Set these in Vercel for Production, Preview, and Development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The first visit needs an internet connection to download the app and MiniLM model. The service worker caches the app shell and static assets; Transformers.js caches model assets in the browser. Reopen the app after its first successful load before going offline.

## Offline-first behavior

1. Apply the SQL migration in `../supabase/migrations` (the deployed project has the schema migration).
Indexed files and history are stored only on this device/browser. Clearing site data deletes the local index. Export/restore and cross-device sync are not included yet.
3. Confirm the private Storage bucket named `documents` exists. The migration creates it and installs owner-scoped policies.
4. Keep Row Level Security enabled on `documents`, `document_chunks`, and `search_history`.

## Local development

```powershell
Set-Location .\frontend
npm install
Copy-Item .env.example .env.local
# No Supabase environment variables are required for local-only mode.
npm run dev
```

Open http://localhost:3000. No Python server, FastAPI process, localhost API URL, or CORS configuration is needed.

## Scripts

| Command | Purpose |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Vitest unit/component tests |
| `npm run build` | Production build |
| `npm run test:e2e` | Playwright browser tests |
| `npm run test:all` | Run all checks |

## Notes

- The first search/upload downloads the quantized MiniLM model in the browser and can take longer.
- Query Analyzer and Compiler Pipeline use the TypeScript compiler locally; they do not call a server.
- PDF text extraction is performed in the browser; scanned PDFs still require OCR, which is not currently included.
- Precision@k, Recall@k, and MRR are not reported until a labelled evaluation dataset exists.
