import type {
  CompilerTrace,
  IndexedFile,
  SearchHistoryEntry,
  SearchMode,
  SearchResult,
  SystemMetrics,
} from "@/types/search";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 120_000; // first upload may download the embedding model

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

/** Error raised for any failed backend call. `network` means the server was unreachable. */
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
  // FastAPI validation errors arrive as an array of {msg, loc}
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  return fallback;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    fallbackMessage = "Request failed",
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      const timedOut = (err as Error)?.name === "AbortError";
      throw new ApiError(
        timedOut
          ? "The server took too long to respond."
          : `Cannot reach the backend at ${this.baseUrl}. Is the API server running?`,
        null,
        true
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(describeDetail(body?.detail, fallbackMessage), res.status);
    }
    return res.json() as Promise<T>;
  }

  checkHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/health", {}, "Backend server unhealthy", 5_000);
  }

  search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    return this.request<SearchResponse>(
      "/api/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          mode: options.mode || "hybrid",
          kind: options.kind || "all",
          type: options.type || "ALL",
          limit: options.limit || 10,
        }),
      },
      "Search request failed",
      60_000 // first search loads the embedding model
    );
  }

  explain(query: string): Promise<CompilerTrace> {
    return this.request<CompilerTrace>(
      "/api/compiler/explain",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      },
      "Compiler explanation failed"
    );
  }

  listFiles(): Promise<IndexedFile[]> {
    return this.request<IndexedFile[]>("/api/files", {}, "Failed to list indexed files");
  }

  uploadFiles(files: File[]): Promise<{ uploaded: unknown[]; totalFilesIndexed: number }> {
    const formData = new FormData();
    for (const file of files) formData.append("files", file);
    return this.request(
      "/api/files/upload",
      { method: "POST", body: formData },
      "File upload failed",
      UPLOAD_TIMEOUT_MS
    );
  }

  deleteFile(fileId: string): Promise<{ deleted: string; status: string }> {
    return this.request(
      `/api/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" },
      "Failed to delete file"
    );
  }

  getHistory(): Promise<SearchHistoryEntry[]> {
    return this.request<SearchHistoryEntry[]>("/api/history", {}, "Failed to fetch search history");
  }

  clearHistory(): Promise<{ cleared: boolean }> {
    return this.request("/api/history", { method: "DELETE" }, "Failed to clear search history");
  }

  getAnalytics(): Promise<AnalyticsResponse> {
    return this.request<AnalyticsResponse>("/api/analytics", {}, "Failed to fetch analytics");
  }
}

export const apiClient = new ApiClient();
