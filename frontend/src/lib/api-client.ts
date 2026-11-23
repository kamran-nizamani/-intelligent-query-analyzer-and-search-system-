import type {
  CompilerTrace,
  IndexedFile,
  SearchHistoryEntry,
  SearchMode,
  SearchResult,
  SystemMetrics,
  SourceKind,
  SourceType,
} from "@/types/search";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase/client";
import { compileQueryTrace } from "./compiler-engine";


export type HealthResponse = {
  status: string;
  database: string;
  chunk_count: number;
  embedding_model: string;
  fts_engine?: string;
  vector_engine?: string;
};

export type SearchOptions = {
  mode?: SearchMode;
  kind?: string;
  type?: string;
  limit?: number;
};

export type SearchResponse = {
  results: SearchResult[];
  latencyMs: number;
  trace: CompilerTrace;
  totalHits: number;
};

export type AnalyticsResponse = SystemMetrics & {
  modeBreakdown?: Record<string, number>;
};

export class ApiError extends Error {
  readonly status: number | null;
  readonly network: boolean;

  constructor(message: string, status: number | null = null, network = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.network = network;
  }
}

function describeDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  return fallback;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapSourceType(fileType: string): SourceType {
  const upper = fileType.toUpperCase();
  if (["PDF", "DOCX", "TXT", "PY", "JS", "JAVA"].includes(upper)) {
    return upper as SourceType;
  }
  if (["TS", "TSX", "JSX"].includes(upper)) return "JS";
  return "TXT";
}

export class ApiClient {
  private async request<T>(): Promise<T> {
    throw new ApiError(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your Vercel project.",
      null,
      true
    );
  }

  private async ensureUserSession(supabase: NonNullable<ReturnType<typeof getSupabaseClient>>) {
    const { data: current, error: currentError } = await supabase.auth.getUser();
    if (currentError) throw new ApiError(`Supabase authentication failed: ${currentError.message}`, 401);
    if (current.user) return current.user;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      throw new ApiError(
        `Anonymous sign-in is required for this app. Enable Anonymous Sign-Ins in Supabase Authentication settings. ${error?.message || ""}`,
        401
      );
    }
    return data.user;
  }

  async checkHealth(): Promise<HealthResponse> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new ApiError("Supabase client failed to initialize", null, true);
      }

      await this.ensureUserSession(supabase);
      const { count, error } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true });

      if (error) {
        throw new ApiError(`Supabase connection error: ${error.message}`, 500, true);
      }

      return {
        status: "healthy",
        database: "Supabase PostgreSQL 15+ (pgvector)",
        chunk_count: count ?? 0,
        embedding_model: "Xenova/all-MiniLM-L6-v2 (Client ONNX 384-D)",
        fts_engine: "PostgreSQL full-text search (GIN)",
        vector_engine: "pgvector HNSW (cosine distance)",
      };
    }

    return this.request<HealthResponse>("/api/health", {}, "Backend server unhealthy", 5_000);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new ApiError("Supabase client not initialized", null, true);
      }

      const t0 = performance.now();
      const trace = compileQueryTrace(query);
      const plan = trace.optimizedIr;

      const { embedText } = await import("./embeddings/web-embedder");
      const embedding = await embedText(plan.semanticQuery || query);

      interface SupabaseChunkRow {
        chunk_id: number;
        document_id: string;
        file_name: string;
        storage_path: string;
        file_type: string;
        source_kind: SourceKind;
        chunk_text: string;
        page_number?: number;
        line_start?: number;
        line_end?: number;
        symbol_name?: string;
        symbol_kind?: string;
        language?: string;
        identifiers?: string[];
        lexical_rank?: number;
        vector_rank?: number;
        rrf_score: number;
      }

      const { data, error } = await supabase.rpc("hybrid_search_rrf", {
        query_text: plan.lexicalQuery || query,
        query_embedding: embedding,
        match_limit: options.limit || plan.limit || 10,
        filter_kind: options.kind && options.kind !== "all" ? options.kind : (plan.filters.content_kind as string) || null,
        filter_language: (plan.filters.language as string) || null,
        filter_symbol: (plan.filters.symbol_kind as string) || null,
        rrf_k: 60,
        search_mode: options.mode || "hybrid",
      });

      if (error) {
        throw new ApiError(`Search query execution failed: ${error.message}`, 500);
      }

      const rows = (data || []) as SupabaseChunkRow[];
      const latencyMs = +(performance.now() - t0).toFixed(1);

      const results: SearchResult[] = rows.map((row) => {
        const title = row.symbol_name || row.file_name;
        const location =
          row.source_kind === "code" && row.line_start && row.line_end
            ? `Lines ${row.line_start}–${row.line_end}${row.symbol_name ? ` · ${row.symbol_kind || "Symbol"} \`${row.symbol_name}\`` : ""}`
            : row.page_number
            ? `Page ${row.page_number}`
            : "Section";

        const tags: string[] = [];
        if (row.language) tags.push(row.language);
        if (row.symbol_kind) tags.push(row.symbol_kind);
        if (row.identifiers && row.identifiers.length > 0) {
          tags.push(...row.identifiers.slice(0, 3));
        }

        let matchType: "hybrid" | "semantic" | "lexical" = "hybrid";
        if (row.lexical_rank && !row.vector_rank) matchType = "lexical";
        else if (!row.lexical_rank && row.vector_rank) matchType = "semantic";

        const description =
          row.lexical_rank && row.vector_rank
            ? `Lexical rank #${row.lexical_rank} · Vector rank #${row.vector_rank}`
            : row.lexical_rank
            ? `Lexical rank #${row.lexical_rank}`
            : `Vector rank #${row.vector_rank}`;

        return {
          id: `chunk-${row.chunk_id}`,
          title,
          path: row.storage_path || row.file_name,
          kind: row.source_kind || "document",
          type: mapSourceType(row.file_type),
          description,
          preview: row.chunk_text,
          location,
          language: row.language,
          symbol: row.symbol_name,
          score: +row.rrf_score.toFixed(4),
          lexicalRank: row.lexical_rank,
          semanticRank: row.vector_rank,
          matchType,
          updated: "Indexed",
          tags,
        };
      });

      // Record to search_history in background
      const user = await this.ensureUserSession(supabase);
      if (user?.id) {
        void supabase.from("search_history").insert({
          user_id: user.id,
          query_text: query,
          mode: options.mode || "hybrid",
          match_count: results.length,
          latency_ms: latencyMs,
          filters: plan.filters,
        });
      }

      return {
        results,
        latencyMs,
        trace,
        totalHits: results.length,
      };
    }

    return this.request<SearchResponse>();
  }

  explain(query: string): Promise<CompilerTrace> {
    // The TypeScript compiler runs locally; no API server is required.
    return Promise.resolve(compileQueryTrace(query));
  }

  async listFiles(): Promise<IndexedFile[]> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) return [];

      interface DocumentRow {
        id: string;
        file_name: string;
        storage_path: string;
        file_type: string;
        content_kind: SourceKind;
        file_size: number;
        chunk_count: number;
        status: string;
        created_at: string;
      }

      const { data, error } = await supabase
        .from("documents")
        .select("id, file_name, storage_path, file_type, content_kind, file_size, chunk_count, status, created_at")
        .order("created_at", { ascending: false });

      if (error || !data) {
        return [];
      }

      return (data as DocumentRow[]).map((d) => ({
        id: d.id,
        name: d.file_name,
        path: d.storage_path,
        kind: d.content_kind || "document",
        type: mapSourceType(d.file_type),
        size: formatBytes(d.file_size || 0),
        rawSize: d.file_size || 0,
        chunks: d.chunk_count || 0,
        status: "Indexed",
        updated: new Date(d.created_at).toLocaleDateString(),
      }));
    }

    return this.request<IndexedFile[]>();
  }

  async uploadFiles(files: File[]): Promise<{ uploaded: unknown[]; totalFilesIndexed: number }> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new ApiError("Supabase client not initialized", null, true);
      }

      const user = await this.ensureUserSession(supabase);

      const { extractFileInBrowser } = await import("./extractors/client-extractors");
      const { embedBatch } = await import("./embeddings/web-embedder");

      const uploadedResults = [];

      for (const file of files) {
        // 1. Extract file in browser
        const extracted = await extractFileInBrowser(file);

        // 2. Upload file to Supabase Storage
        const storagePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: storageError } = await supabase.storage
          .from("documents")
          .upload(storagePath, file, { upsert: true });

        if (storageError) {
          throw new ApiError(`Storage upload failed: ${storageError.message}`);
        }

        // 3. Insert document record
        const { data: docRecord, error: docError } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            file_name: file.name,
            storage_path: storagePath,
            file_type: extracted.fileType,
            file_size: file.size,
            chunk_count: extracted.chunks.length,
            content_kind: extracted.contentKind,
            status: "indexed",
          })
          .select("id")
          .single();

        if (docError || !docRecord) {
          throw new ApiError(`Document database record creation failed: ${docError?.message}`);
        }

        // 4. Compute embeddings for chunks
        const chunkTexts = extracted.chunks.map((c) => c.chunkText);
        const embeddings = await embedBatch(chunkTexts);

        // 5. Bulk insert document chunks
        const chunkRows = extracted.chunks.map((chunk, idx) => ({
          document_id: docRecord.id,
          user_id: user.id,
          chunk_index: idx,
          chunk_text: chunk.chunkText,
          file_path: storagePath,
          source_kind: chunk.sourceKind,
          page_number: chunk.pageNumber ?? null,
          line_start: chunk.lineStart ?? null,
          line_end: chunk.lineEnd ?? null,
          symbol_name: chunk.symbolName ?? null,
          symbol_kind: chunk.symbolKind ?? null,
          language: chunk.language ?? null,
          identifiers: chunk.identifiers ?? [],
          embedding: embeddings[idx],
        }));

        if (chunkRows.length > 0) {
          const { error: chunkError } = await supabase
            .from("document_chunks")
            .insert(chunkRows);

          if (chunkError) {
            throw new ApiError(`Chunk insertion failed: ${chunkError.message}`);
          }
        }

        uploadedResults.push({ id: docRecord.id, name: file.name, chunks: chunkRows.length });
      }

      return { uploaded: uploadedResults, totalFilesIndexed: uploadedResults.length };
    }

    return this.request();
  }

  async deleteFile(fileId: string): Promise<{ deleted: string; status: string }> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new ApiError("Supabase client not initialized", null, true);
      }

      const { data: document, error: lookupError } = await supabase
        .from("documents").select("storage_path").eq("id", fileId).single();
      if (lookupError) throw new ApiError(`Failed to find document: ${lookupError.message}`);
      const { error: storageError } = await supabase.storage.from("documents").remove([document.storage_path]);
      if (storageError) throw new ApiError(`Failed to remove stored file: ${storageError.message}`);
      const { error } = await supabase.from("documents").delete().eq("id", fileId);
      if (error) {
        throw new ApiError(`Failed to delete document: ${error.message}`);
      }

      return { deleted: fileId, status: "success" };
    }

    return this.request();
  }

  async getHistory(): Promise<SearchHistoryEntry[]> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) return [];

      interface HistoryRow {
        id: string;
        query_text: string;
        mode: SearchMode;
        match_count: number;
        latency_ms: number;
        filters: Record<string, string>;
        created_at: string;
      }

      const { data, error } = await supabase
        .from("search_history")
        .select("id, query_text, mode, match_count, latency_ms, filters, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error || !data) return [];

      return (data as HistoryRow[]).map((row) => ({
        id: row.id,
        query: row.query_text,
        timestamp: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        date: new Date(row.created_at).toLocaleDateString(),
        mode: row.mode || "hybrid",
        resultsCount: row.match_count || 0,
        latencyMs: +row.latency_ms.toFixed(1),
        filtersApplied: row.filters,
      }));
    }

    return this.request<SearchHistoryEntry[]>();
  }

  async clearHistory(): Promise<{ cleared: boolean }> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) return { cleared: false };

      const user = await this.ensureUserSession(supabase);
      if (user) {
        await supabase.from("search_history").delete().eq("user_id", user.id);
      }
      return { cleared: true };
    }

    return this.request();
  }

  async getAnalytics(): Promise<AnalyticsResponse> {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new ApiError("Supabase not initialized", null, true);
      }

      const [docsRes, chunksRes, histRes] = await Promise.all([
        supabase.from("documents").select("content_kind"),
        supabase.from("document_chunks").select("id", { count: "exact", head: true }),
        supabase.from("search_history").select("latency_ms, mode"),
      ]);

      if (docsRes.error || chunksRes.error || histRes.error) {
        throw new ApiError(`Analytics query failed: ${docsRes.error?.message || chunksRes.error?.message || histRes.error?.message}`);
      }
      const docs = (docsRes.data || []) as { content_kind?: string }[];
      const totalDocuments = docs.filter((d) => d.content_kind === "document").length;
      const totalCodeFiles = docs.filter((d) => d.content_kind === "code").length;
      const totalChunks = chunksRes.count ?? 0;

      const historyData = (histRes.data || []) as { latency_ms?: number; mode?: string }[];
      const totalSearches = historyData.length;
      const avgLatencyMs =
        totalSearches > 0
          ? +(historyData.reduce((acc, h) => acc + (h.latency_ms || 0), 0) / totalSearches).toFixed(1)
          : 0;

      const modeBreakdown: Record<string, number> = { hybrid: 0, semantic: 0, lexical: 0 };
      for (const h of historyData) {
        const m = h.mode || "hybrid";
        modeBreakdown[m] = (modeBreakdown[m] || 0) + 1;
      }

      return {
        totalDocuments,
        totalCodeFiles,
        totalChunks,
        totalSearches,
        avgLatencyMs,
        ftsStatus: "Online",
        faissStatus: "Online",
        embeddingModel: "Xenova/all-MiniLM-L6-v2 (Client ONNX 384-D)",
        precisionAt1: 0,
        precisionAt5: 0,
        recallAt5: 0,
        mrrScore: 0,
        modeBreakdown,
      };
    }

    return this.request<AnalyticsResponse>();
  }
}

export const apiClient = new ApiClient();
