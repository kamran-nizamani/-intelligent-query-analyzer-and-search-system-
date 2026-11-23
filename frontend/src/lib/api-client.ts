import type {
  CompilerTrace, IndexedFile, SearchHistoryEntry, SearchMode, SearchResult,
  SystemMetrics, SourceKind, SourceType,
} from "@/types/search";
import { compileQueryTrace } from "./compiler-engine";

const DB_NAME = "intelligent-query-analyzer";
const DB_VERSION = 1;
type StoreName = "documents" | "chunks" | "history";

type LocalDocument = {
  id: string; file_name: string; file_type: string; content_kind: SourceKind;
  file_size: number; chunk_count: number; created_at: string; raw_file: Blob;
};
type LocalChunk = {
  id: string; document_id: string; file_name: string; file_type: string;
  storage_path: string; source_kind: SourceKind; chunk_text: string;
  page_number?: number; line_start?: number; line_end?: number;
  symbol_name?: string; symbol_kind?: string; language?: string;
  identifiers: string[]; embedding: number[];
};
type LocalHistory = {
  id: string; query_text: string; mode: SearchMode; match_count: number;
  latency_ms: number; filters: Record<string, string>; created_at: string;
};

export type HealthResponse = {
  status: string; database: string; chunk_count: number;
  embedding_model: string; fts_engine?: string; vector_engine?: string;
};
export type SearchOptions = { mode?: SearchMode; kind?: string; type?: string; limit?: number };
export type SearchResponse = { results: SearchResult[]; latencyMs: number; trace: CompilerTrace; totalHits: number };
export type AnalyticsResponse = SystemMetrics & { modeBreakdown?: Record<string, number> };

export class ApiError extends Error {
  readonly status: number | null;
  readonly network: boolean;
  constructor(message: string, status: number | null = null, network = false) {
    super(message); this.name = "ApiError"; this.status = status; this.network = network;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new ApiError("IndexedDB is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) {
        const store = db.createObjectStore("chunks", { keyPath: "id" });
        store.createIndex("document_id", "document_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local database."));
    request.onblocked = () => reject(new Error("Close older Query Analyzer tabs to upgrade local storage."));
  });
}

async function all<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function putMany<T>(storeName: StoreName, values: T[]): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      values.forEach((value) => tx.objectStore(storeName).put(value));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Local database transaction aborted."));
    });
  } finally { db.close(); }
}
async function clear(storeName: StoreName): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function sourceType(ext: string): SourceType {
  const value = ext.toUpperCase();
  if (["PDF", "DOCX", "TXT", "PY", "JS", "JAVA"].includes(value)) return value as SourceType;
  if (["TS", "TSX", "JSX"].includes(value)) return "JS";
  return "TXT";
}
function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function lexicalScore(query: string, text: string): number {
  const terms = Array.from(new Set(query.toLowerCase().match(/[a-z0-9_]+/g) ?? [])).filter((x) => x.length > 1);
  if (!terms.length) return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = haystack.match(new RegExp(escaped, "g"))?.length ?? 0;
    if (matches) score += 1 + Math.log(1 + matches);
  }
  return score / Math.sqrt(Math.max(1, haystack.split(/\s+/).length));
}

export class ApiClient {
  async checkHealth(): Promise<HealthResponse> {
    const chunks = await all<LocalChunk>("chunks");
    return {
      status: "healthy", database: "Browser IndexedDB (offline-first)",
      chunk_count: chunks.length, embedding_model: "Xenova/all-MiniLM-L6-v2 (local ONNX)",
      fts_engine: "Local keyword index", vector_engine: "Local cosine similarity",
    };
  }

  explain(query: string): Promise<CompilerTrace> { return Promise.resolve(compileQueryTrace(query)); }

  async uploadFiles(files: File[]): Promise<{ uploaded: unknown[]; totalFilesIndexed: number }> {
    const { extractFileInBrowser } = await import("./extractors/client-extractors");
    const { embedBatch } = await import("./embeddings/web-embedder");
    const uploaded: { id: string; name: string; chunks: number }[] = [];
    for (const file of files) {
      const extracted = await extractFileInBrowser(file);
      if (!extracted.rawText.trim() || extracted.chunks.length === 0) {
        throw new ApiError(`No searchable text could be extracted from ${file.name}. For scanned PDFs, run OCR first.`);
      }
      const vectors = await embedBatch(extracted.chunks.map((chunk) => chunk.chunkText));
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const document: LocalDocument = {
        id, file_name: file.name, file_type: extracted.fileType,
        content_kind: extracted.contentKind, file_size: file.size,
        chunk_count: extracted.chunks.length, created_at: createdAt, raw_file: file,
      };
      const chunks: LocalChunk[] = extracted.chunks.map((chunk, index) => ({
        id: `${id}:${index}`, document_id: id, file_name: file.name,
        file_type: extracted.fileType, storage_path: file.name,
        source_kind: chunk.sourceKind, chunk_text: chunk.chunkText,
        page_number: chunk.pageNumber, line_start: chunk.lineStart, line_end: chunk.lineEnd,
        symbol_name: chunk.symbolName, symbol_kind: chunk.symbolKind,
        language: chunk.language, identifiers: chunk.identifiers ?? [], embedding: vectors[index],
      }));
      await putMany("documents", [document]);
      await putMany("chunks", chunks);
      uploaded.push({ id, name: file.name, chunks: chunks.length });
    }
    return { uploaded, totalFilesIndexed: uploaded.length };
  }

  async listFiles(): Promise<IndexedFile[]> {
    const docs = (await all<LocalDocument>("documents")).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return docs.map((doc) => ({
      id: doc.id, name: doc.file_name, path: doc.file_name,
      kind: doc.content_kind, type: sourceType(doc.file_type), size: bytes(doc.file_size),
      rawSize: doc.file_size, chunks: doc.chunk_count, status: "Indexed",
      updated: new Date(doc.created_at).toLocaleDateString(),
      contentPreview: "",
    }));
  }

  async deleteFile(fileId: string): Promise<{ deleted: string; status: string }> {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["documents", "chunks"], "readwrite");
        tx.objectStore("documents").delete(fileId);
        const index = tx.objectStore("chunks").index("document_id");
        const request = index.openCursor(IDBKeyRange.only(fileId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    return { deleted: fileId, status: "success" };
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const t0 = performance.now();
    const trace = compileQueryTrace(query);
    const plan = trace.optimizedIr;
    const mode = options.mode ?? "hybrid";
    const chunks = await all<LocalChunk>("chunks");
    let queryVector: number[] | null = null;
    if (mode !== "lexical" && chunks.length) {
      const { embedText } = await import("./embeddings/web-embedder");
      queryVector = await embedText(plan.semanticQuery || query);
    }
    const candidates = chunks.filter((chunk) => {
      if (options.kind && options.kind !== "all" && chunk.source_kind !== options.kind) return false;
      if (plan.filters.language && chunk.language !== plan.filters.language) return false;
      if (plan.filters.symbol_kind && chunk.symbol_kind !== plan.filters.symbol_kind) return false;
      return true;
    }).map((chunk) => {
      const lexical = lexicalScore(plan.lexicalQuery || query, chunk.chunk_text);
      const semantic = queryVector ? Math.max(0, cosine(queryVector, chunk.embedding)) : 0;
      return { chunk, lexical, semantic };
    });
    const lexicalRanked = [...candidates].filter((x) => x.lexical > 0).sort((a,b) => b.lexical-a.lexical);
    const semanticRanked = [...candidates].filter((x) => x.semantic > 0).sort((a,b) => b.semantic-a.semantic);
    const lexRanks = new Map(lexicalRanked.map((x,i) => [x.chunk.id, i+1]));
    const semRanks = new Map(semanticRanked.map((x,i) => [x.chunk.id, i+1]));
    const ranked = candidates.map((x) => {
      const lr = lexRanks.get(x.chunk.id), sr = semRanks.get(x.chunk.id);
      const score = mode === "lexical" ? x.lexical
        : mode === "semantic" ? x.semantic
        : (lr ? 1/(60+lr) : 0) + (sr ? 1/(60+sr) : 0);
      return { ...x, lr, sr, score };
    }).filter((x) => x.score > 0).sort((a,b) => b.score-a.score).slice(0, options.limit ?? plan.limit ?? 10);
    const results: SearchResult[] = ranked.map(({chunk, lexical, semantic, lr, sr, score}) => {
      const matchType = lr && sr ? "hybrid" : lr ? "lexical" : "semantic";
      const tags = [chunk.language, chunk.symbol_kind, ...chunk.identifiers.slice(0,3)].filter(Boolean) as string[];
      return {
        id: chunk.id, title: chunk.symbol_name || chunk.file_name,
        path: chunk.storage_path, kind: chunk.source_kind, type: sourceType(chunk.file_type),
        description: lr && sr ? `Keyword #${lr} · Semantic #${sr}` : lr ? `Keyword rank #${lr}` : `Semantic rank #${sr}`,
        preview: chunk.chunk_text,
        location: chunk.source_kind === "code" && chunk.line_start && chunk.line_end
          ? `Lines ${chunk.line_start}–${chunk.line_end}`
          : chunk.page_number ? `Page ${chunk.page_number}` : "Section",
        language: chunk.language, symbol: chunk.symbol_name,
        score: Number(score.toFixed(6)), lexicalRank: lr, semanticRank: sr,
        matchType, updated: "Indexed", tags,
      };
    });
    const latencyMs = Number((performance.now()-t0).toFixed(1));
    const history: LocalHistory = {
      id: crypto.randomUUID(), query_text: query, mode, match_count: results.length,
      latency_ms: latencyMs, filters: plan.filters, created_at: new Date().toISOString(),
    };
    await putMany("history", [history]);
    return { results, latencyMs, trace, totalHits: results.length };
  }

  async getHistory(): Promise<SearchHistoryEntry[]> {
    const rows = (await all<LocalHistory>("history")).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,50);
    return rows.map((row) => {
      const date = new Date(row.created_at);
      return {
        id: row.id, query: row.query_text,
        timestamp: date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}),
        date: date.toLocaleDateString(), mode: row.mode, resultsCount: row.match_count,
        latencyMs: row.latency_ms, filtersApplied: row.filters,
      };
    });
  }

  async clearHistory(): Promise<{ cleared: boolean }> { await clear("history"); return { cleared: true }; }

  async getAnalytics(): Promise<AnalyticsResponse> {
    const [docs, chunks, history] = await Promise.all([
      all<LocalDocument>("documents"), all<LocalChunk>("chunks"), all<LocalHistory>("history"),
    ]);
    const modeBreakdown: Record<string, number> = { hybrid: 0, semantic: 0, lexical: 0 };
    history.forEach((entry) => { modeBreakdown[entry.mode] = (modeBreakdown[entry.mode] ?? 0) + 1; });
    const totalSearches = history.length;
    return {
      totalDocuments: docs.filter((d) => d.content_kind === "document").length,
      totalCodeFiles: docs.filter((d) => d.content_kind === "code").length,
      totalChunks: chunks.length, totalSearches,
      avgLatencyMs: totalSearches ? Number((history.reduce((sum,h)=>sum+h.latency_ms,0)/totalSearches).toFixed(1)) : 0,
      ftsStatus: "Online", faissStatus: "Online",
      embeddingModel: "Xenova/all-MiniLM-L6-v2 (local ONNX 384-D)",
      precisionAt1: 0, precisionAt5: 0, recallAt5: 0, mrrScore: 0, modeBreakdown,
    };
  }
}
export const apiClient = new ApiClient();
