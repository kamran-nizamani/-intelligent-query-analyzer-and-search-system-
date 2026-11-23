# Intelligent Query Analyzer — Frontend

Next.js 15 / React 19 / TypeScript. The deployed application is **Supabase-native**: there is no FastAPI service and no separate API host to configure.

## Architecture

- **Vercel:** hosts the Next.js application.
- **Supabase Auth:** anonymous user sessions, so each browser gets a private workspace.
- **Supabase Storage:** private `documents` bucket for uploaded files.
- **Supabase PostgreSQL:** document metadata, chunks, search history, and analytics.
- **pgvector + PostgreSQL full-text search:** semantic and lexical retrieval combined with Reciprocal Rank Fusion.
- **Browser:** extracts PDF/DOCX/TXT and source code, runs the TypeScript query compiler, and generates 384-dimensional MiniLM embeddings with Transformers.js.

## Environment variables

Set these in Vercel for Production, Preview, and Development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a compatibility fallback. Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable.

## Supabase setup

1. Apply the SQL migration in `../supabase/migrations` (the deployed project has the schema migration).
2. In Supabase Dashboard → Authentication → Sign In / Providers, enable **Anonymous Sign-Ins**. The app creates a per-browser anonymous account automatically; RLS keeps each user's documents, chunks, and history private.
3. Confirm the private Storage bucket named `documents` exists. The migration creates it and installs owner-scoped policies.
4. Keep Row Level Security enabled on `documents`, `document_chunks`, and `search_history`.

## Local development

```powershell
Set-Location .\frontend
npm install
Copy-Item .env.example .env.local
# Fill in the Supabase URL and publishable key in .env.local
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
