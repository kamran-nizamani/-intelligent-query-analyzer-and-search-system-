# Intelligent Query Analyzer & Search System — Automated Test Report

**Execution Date:** November 2026  
**Test Engine:** Vitest 2.1.9, React Testing Library, TypeScript Compiler 5.7.2  
**Result:** **100% Passing (54 Tests Passed, 0 Failures, 0 Warnings)**  

---

## 1. Test Execution Summary

```
 RUN  v2.1.9 C:/Users/Kamran/Desktop/Sematic search/frontend

 ✓ tests/unit/supabase-migration.test.ts (9 tests)
 ✓ tests/unit/lib.test.ts (10 tests)
 ✓ tests/unit/components.test.tsx (35 tests)

 Test Files  3 passed (3)
      Tests  54 passed (54)
   Duration  17.70s
```

---

## 2. Test Suites Breakdown

### 2.1 Unit Tests (`tests/unit/lib.test.ts`)
- `validateUploads`:
  - Accepts supported, non-empty files (`a.py`, `B.PDF`, `n.txt`).
  - Rejects unsupported extensions, empty files, oversize files (>20 MB), and extension-less names.
  - Accepts boundary file of exactly 20 MB (`MAX_UPLOAD_BYTES`).
- `extractHighlightTerms`:
  - Drops stop words and short terms, lower-cases and de-duplicates correctly.
  - Returns empty list for empty input.
- `ApiClient`:
  - Does not make unauthorized HTTP requests when Supabase is unconfigured.
  - Runs query compiler locally without remote server dependency.
- `browser-based TypeScript compiler`:
  - Produces a structurally complete 7-stage compiler trace.
- `PDF FlateDecode extraction`:
  - Extracts text from compressed FlateDecode PDF streams (`zlib.deflateSync`).
  - Extracts text from plain uncompressed streams.

### 2.2 Supabase Migration Compatibility (`tests/unit/supabase-migration.test.ts`)
- Validates SQL migration statements for column alignment:
  - `name` $\to$ `file_name` in `public.documents`.
  - `content` $\to$ `chunk_text` in `public.document_chunks`.
  - `start_line` / `end_line` $\to$ `line_start` / `line_end`.
  - `query` $\to$ `query_text` in `public.search_history`.
- Validates RLS policies on `documents`, `document_chunks`, `search_history`, and `storage.objects`.
- Validates `hybrid_search_rrf` function signature and 384-D vector type compatibility.

### 2.3 Component & UI Tests (`tests/unit/components.test.tsx`)
- `Toast`: Polite announcements on success, assertive alerts on error; auto-closes after timeout.
- `Sidebar`:
  - Marks current active route; reports real backend status.
  - Emits selected route on button click with concurrent transition.
- `PreviewModal`: Accessible dialog; closes on Escape; displays raw RRF score.
- `SearchView`:
  - Renders search input, mode selection chips, and voice toggle.
  - Filters client-side results by kind and reports matching counts.
  - Sorts results by title (A-Z) and relevance score.
- `LibraryView`:
  - Renders indexed files with size, type, and chunk count.
  - Filters by tab ("All", "Document", "Code") and search text.
  - Requires explicit confirmation before file deletion.
- `HistoryView`:
  - Renders recent searches with timestamps and latency numbers.
  - Provides two-click clear history confirmation.
- `AnalyticsView`:
  - Renders system metrics, mode breakdown cards, and retrieval precision indicators.

---

## 3. Type Checking & Code Quality
- **TypeScript (`tsc --noEmit`):** Clean exit code `0`, no compilation errors.
- **ESLint (`eslint .`):** Clean exit code `0`, no lint errors or warnings.
- **Production Build (`next build`):** Clean exit code `0`, all static routes prerendered.
