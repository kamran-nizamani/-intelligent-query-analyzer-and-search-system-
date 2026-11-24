# Intelligent Query Analyzer & Search System — Deployment Report

**Project:** Intelligent Query Analyzer and Search System  
**Hosting Environment:** Vercel (Edge Network / Static CDN) + Supabase (PostgreSQL 15+, pgvector, Auth, Storage)  
**Date:** November 2026  
**Status:** Production Ready  

---

## 1. Deployment Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │            Vercel Edge Network               │
                    │        (Next.js 15.5+ App Router)            │
                    │      Static HTML / JS / CSS (203 kB)         │
                    └──────────────────────┬───────────────────────┘
                                           │
                           HTTPS / Direct PostgREST + RPC
                                           │
                    ┌──────────────────────▼───────────────────────┐
                    │               Supabase Cloud                 │
                    │                                              │
                    │ ┌──────────────────────────────────────────┐ │
                    │ │ PostgreSQL Database 15+                  │ │
                    │ │ - Extension: pgvector (384-D vectors)    │ │
                    │ │ - Extension: pg_trgm                     │ │
                    │ │ - Function: hybrid_search_rrf()          │ │
                    │ │ - RLS: Multi-tenant user isolation       │ │
                    │ └──────────────────────────────────────────┘ │
                    │                                              │
                    │ ┌──────────────────────────────────────────┐ │
                    │ │ Supabase Storage                         │ │
                    │ │ - Bucket: documents (private)            │ │
                    │ └──────────────────────────────────────────┘ │
                    │                                              │
                    │ ┌──────────────────────────────────────────┐ │
                    │ │ Supabase Auth                            │ │
                    │ │ - Anonymous Sign-Ins enabled             │ │
                    │ └──────────────────────────────────────────┘ │
                    └──────────────────────────────────────────────┘
```

---

## 2. Environment Variables Verification

The following environment variables are required in the Vercel project configuration:

| Variable | Scope | Description | Status |
| :--- | :---: | :--- | :---: |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Client/Edge) | Supabase project endpoint (e.g. `https://<ref>.supabase.co`) | **CONFIGURED** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public (Client/Edge) | Supabase anonymous/publishable key | **CONFIGURED** |

> [!NOTE]
> No secret backend keys or service role keys are exposed to the client. All operations obey PostgreSQL Row-Level Security (RLS) under the user's session token.

---

## 3. Supabase Configuration Prerequisites

1. **Anonymous Sign-Ins:**
   In Supabase Dashboard, navigate to **Authentication $\to$ Providers $\to$ Anonymous Sign-Ins** and ensure **"Allow anonymous sign-ins"** is enabled. This allows browser sessions to obtain an authenticated `user_id` without requiring an email login.
2. **Database Extensions:**
   Ensure `vector` and `pg_trgm` extensions are enabled (handled automatically by `20261123_supabase_native_runtime.sql`).
3. **Storage Bucket:**
   Ensure the private `documents` bucket exists with RLS policies enabled.

---

## 4. Verification Checklists

- [x] Client bundles build cleanly with `next build` ($203\text{ kB}$ First Load JS).
- [x] No serverless Lambda functions exceed size budgets ($0\text{ MB}$ server functions).
- [x] TypeScript type checking passes (`tsc --noEmit`).
- [x] ESLint validation passes with zero errors or warnings.
- [x] All 54 automated unit and component tests pass (`vitest run`).
- [x] Anti-flash theme script in `<head>` verified.
- [x] FlateDecode PDF parser handles compressed PDF uploads (`23F-02_SRS_v3.3.pdf`).
- [x] Search fallback logic returns relevant chunks across documents and code.
- [x] INP delays verified under $16\text{ ms}$ on user interactions.
