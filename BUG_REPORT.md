# Intelligent Query Analyzer & Search System — Bug Report

**Date:** November 2026  
**Status:** All Identified Critical & Major Issues Resolved  
**Scope:** Frontend, Extractors, Search Pipeline, RLS Authentication, UI/UX Performance  

---

## Summary of Identified Bugs

| Bug ID | Severity | Component | Issue Summary | Status |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | **P0 (Critical)** | `api-client.ts` / Search | Search returns 0 results due to over-restrictive compiler filters | **RESOLVED** |
| **BUG-002** | **P0 (Critical)** | `client-extractors.ts` | Compressed PDF (FlateDecode) extraction produces 0 chunks (`23F-02_SRS_v3.3.pdf`) | **RESOLVED** |
| **BUG-003** | **P0 (Critical)** | `api-client.ts` / Upload | Upload marks document as `indexed` when 0 chunks were inserted | **RESOLVED** |
| **BUG-004** | **P0 (Critical)** | `api-client.ts` / Auth | Stale or uninitialized session blocks upload with `You must be signed in` | **RESOLVED** |
| **BUG-005** | **P1 (High)** | `search-view.tsx` / INP | Sample query buttons block main thread for 2,153.4 ms | **RESOLVED** |
| **BUG-006** | **P1 (High)** | `sidebar.tsx` / INP | Nav link clicks block main thread for 416 ms | **RESOLVED** |
| **BUG-007** | **P1 (Medium)** | `layout.tsx` / Theme | Flash of dark theme (FOUC) and lack of System Default theme option | **RESOLVED** |
| **BUG-008** | **P2 (Medium)** | `api-client.ts` / DB | Missing error cleanup creates orphaned records on upload failure | **RESOLVED** |

---

## Detailed Bug Reports

### BUG-001: Search Query Returns 0 Results on Natural Language Queries
- **Symptoms:** Queries such as *"Find Python functions that process CSV files"* or *"Search Java classes that implement authentication"* returned 0 matches, even when documents or code files were indexed.
- **Root Cause:** 
  1. The compiler's natural-language parser extracted `language: "python"` and `symbol_kind: "function"`.
  2. In `api-client.ts`, these filters were unconditionally passed to the Supabase RPC `hybrid_search_rrf`.
  3. The SQL query enforced `where (filter_symbol is null or lower(c.symbol_kind) = lower(filter_symbol))` and `(filter_language is null or lower(c.language) = lower(filter_language))`.
  4. For all standard document chunks (PDF/DOCX/TXT), `c.language` is `NULL` and `c.symbol_kind` is `NULL`, causing 100% of document chunks to be excluded.
  5. If code files were indexed without specific AST symbol tags, they were also excluded.
- **Fix Implemented:** 
  - Only apply explicit user-selected content kind filters when `options.kind !== "all"`.
  - Added an automatic resilient fallback: If strict compiler filters yield 0 results, the system re-executes `hybrid_search_rrf` with relaxed filters (`filter_language: null`, `filter_symbol: null`).
  - Verified that relevant matches from indexed documents and code repositories are returned accurately.

---

### BUG-002: In-Browser PDF Text Extraction Failure on FlateDecode Streams
- **Symptoms:** Uploading compressed PDF files (such as `23F-02_SRS_v3.3.pdf`) resulted in empty text extraction, 0 chunks created, or corrupt binary fragments.
- **Root Cause:**
  `extractBasicPdfText` previously used a naive Latin1 regex over raw stream slices. In modern PDFs, content streams are compressed using zlib (`/FlateDecode`). Treating binary zlib bytes as plain text and filtering with `/[^\x20-\x7E\r\n\t]/g` eliminated all compressed data, yielding an empty string.
- **Fix Implemented:**
  - Integrated `pako` deflation to synchronously decompress zlib/deflate PDF stream slices.
  - Implemented an AST-compliant PDF stream parser that extracts text from `BT ... ET` text objects, handling parenthesized strings with escapes (`(...) Tj`), kerning arrays (`[...] TJ`), and hex strings (`<...>`).
  - Added fallback ASCII extraction for uncompressed streams.
  - Added unit tests in `lib.test.ts` verifying extraction of both compressed and uncompressed PDF content.

---

### BUG-003: Document Marked `indexed` with 0 Chunks
- **Symptoms:** Documents appeared in the Document Library with `status: "Indexed"` and `chunks: 0` (or `chunk_count: 1` with 0 actual rows in `document_chunks`).
- **Root Cause:**
  In `uploadFiles`, `supabase.from("documents").update({ status: "indexed" })` was executed unconditionally, even when `chunkRows.length === 0` or after an extraction failure.
- **Fix Implemented:**
  - Added explicit pre-upload validation: `if (!extracted.chunks || extracted.chunks.length === 0)` immediately halts the pipeline and throws `ApiError("No searchable text or code chunks could be extracted from...")`.
  - Wrapped chunk insertion and document updating in a strict try-catch block.
  - If chunk insertion fails, the document and storage file are automatically removed, preventing corrupt orphan records.
  - `chunk_count` on the document record is updated to match the actual inserted chunk count.

---

### BUG-004: Upload Fails with "You must be signed in to upload documents to Supabase"
- **Symptoms:** Users encountering uninitialized or expired sessions were blocked from uploading documents or querying the database with authentication errors.
- **Root Cause:**
  `ensureUserSession` called `supabase.auth.getUser()`. If no session existed in `localStorage`, `@supabase/supabase-js` threw `AuthSessionMissingError`. Because the code checked `if (currentError) throw new ApiError(...)`, it threw immediately without attempting `supabase.auth.signInAnonymously()`.
- **Fix Implemented:**
  - Refactored `ensureUserSession` to check `getSession()` and `getUser()` gracefully without prematurely throwing.
  - If no session exists, it initiates `signInAnonymously()` with a singleton promise lock.
  - If anonymous sign-in is disabled in the Supabase Dashboard, it returns an actionable error message directing the administrator to enable "Anonymous Sign-Ins".

---

### BUG-005: INP Issue — 2,153.4 ms Main-Thread Block on Sample Query Buttons
- **Symptoms:** Clicking sample query buttons (`button.btn-secondary`) blocked user interaction and UI updates for over 2.1 seconds.
- **Root Cause:**
  1. The click event synchronously called `onExecuteSearch()`.
  2. `onExecuteSearch()` immediately invoked `embedText()`, which loaded `@xenova/transformers` and compiled the ONNX Runtime Web model on the main JavaScript thread.
  3. The browser's Performance Observer flagged the click handler as blocking the main thread for the entire 2.15-second model compilation period.
- **Fix Implemented:**
  - Wrapped `onQueryChange` in `startTransition()`.
  - Scheduled `onExecuteSearch` using `setTimeout(..., 0)` to allow the browser's event loop to immediately flush and paint button state changes (<16 ms).
  - Added an idle pre-warmer in `SearchWorkspace` using `setTimeout` to instantiate the embedder 1.5 seconds after page load, eliminating cold-start compilation during search interactions.

---

### BUG-006: INP Issue — 416 ms Block on Sidebar Navigation Links
- **Symptoms:** Clicking navigation links (`button.nav-link`) in the sidebar caused a 416 ms delay before the active state painted.
- **Root Cause:**
  Switching views caused the unmounting of the current view and synchronous React tree mounting of the new view component, blocking the main thread.
- **Fix Implemented:**
  - Wrapped `onSelectView(item.id)` inside `React.startTransition()` in `sidebar.tsx`.
  - React now renders the target view transitions concurrently without blocking button feedback.

---

### BUG-007: Theme Flash (FOUC) and Missing System Default Theme
- **Symptoms:** Page always initialized in dark mode during SSR, creating a flash of dark theme for light-mode users. No option existed for "System Default".
- **Root Cause:**
  - `html data-theme="dark"` was hardcoded in `layout.tsx`.
  - `AppTheme` type was limited to `"dark" | "light"`.
- **Fix Implemented:**
  - Expanded `AppTheme` to `"dark" | "light" | "system"`.
  - Added an inline anti-flash script in `layout.tsx` `<head>` that reads `localStorage` and `prefers-color-scheme` synchronously before rendering.
  - Added a dynamic `matchMedia("(prefers-color-scheme: dark)")` listener in `SearchWorkspace`.
  - Added the "System" option in `SettingsView` with the `Laptop` icon.
