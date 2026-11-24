# Intelligent Query Analyzer & Search System — Root Cause Analysis (RCA)

**Author:** Principal Software Engineer & Systems Architect  
**Date:** November 2026  
**Status:** Completed & Documented  

---

## 1. Problem Statement
Users experienced critical retrieval and ingestion failures:
1. Searches returned 0 results for standard natural-language queries.
2. PDF uploads failed or produced 0 indexed chunks with inconsistent database status.
3. Interaction to Next Paint (INP) delays reached over $2,100\text{ ms}$ on user interactions.
4. Uploads were rejected with session authentication errors.

---

## 2. 5-Whys Analysis

### 2.1 Why did Search return 0 results?
1. **Why?** The Supabase RPC query returned 0 rows.
2. **Why?** The SQL `WHERE` clause had conditions `lower(c.symbol_kind) = lower(filter_symbol)` and `lower(c.language) = lower(filter_language)`.
3. **Why were those filters present?** The natural language query parser identified keywords like *"functions"* and *"Python"* and populated `plan.filters.symbol_kind = "function"` and `plan.filters.language = "python"`.
4. **Why did this eliminate valid chunks?** Non-code documents (PDF, DOCX, TXT) have `language = NULL` and `symbol_kind = NULL`. Additionally, code files uploaded without symbol indexing also have `NULL` symbol kinds. In PostgreSQL, `NULL = 'function'` evaluates to false/unknown, so all chunks were discarded.
5. **Why was there no fallback?** The client query executor accepted whatever the compiler IR produced without evaluating whether the filters were too narrow for the available corpus.

### 2.2 Why did PDF uploads produce 0 chunks?
1. **Why?** `chunkProseText()` received an empty or corrupted text string.
2. **Why?** `extractBasicPdfText()` failed to extract text from the PDF file.
3. **Why did it fail?** It decoded binary data as Latin1 and matched `/stream[\s\S]*?endstream/` before applying an ASCII printable filter `/[^\x20-\x7E]/`.
4. **Why did the ASCII filter strip everything?** Real-world PDFs (e.g., `23F-02_SRS_v3.3.pdf`) compress content streams with zlib/FlateDecode. The bytes are binary compressed tokens, not ASCII text. Stripping non-ASCII characters wiped out the compressed payload.
5. **Why was the document still marked as "Indexed"?** The upload loop in `api-client.ts` unconditionally issued an `UPDATE documents SET status = 'indexed'` even when `extracted.chunks.length === 0`.

### 2.3 Why did buttons suffer 2,153 ms INP latency?
1. **Why?** The browser's Performance Observer detected a long frame block after clicking `button.btn-secondary`.
2. **Why was the main thread blocked?** The click event handler was waiting for `onExecuteSearch()`.
3. **Why did `onExecuteSearch()` block synchronously?** It called `embedText()`, which downloaded and compiled the ONNX Runtime Web model (`all-MiniLM-L6-v2`) on the main JavaScript thread.
4. **Why was the model compiled on click?** The embedder was lazily initialized only when the first search request arrived, without idle pre-warming.
5. **Why was the click handler attached directly to the async process?** The `onClick` handler did not wrap state updates in `startTransition()` or yield execution via `setTimeout(..., 0)`.

---

## 3. Preventive Architecture Measures
1. **Defensive Ingestion:** Never commit a document to PostgreSQL as `status: 'indexed'` without verifying `chunkRows.length > 0`.
2. **Resilient Retrieval:** Compiler IR filters are treated as query hints. When a strict query returns 0 hits, the engine transparently retries with relaxed constraints before reporting an empty result set.
3. **Asynchronous Decoupling:** Event handlers never perform heavy computations or synchronous model compilation directly inside user interaction callbacks.
