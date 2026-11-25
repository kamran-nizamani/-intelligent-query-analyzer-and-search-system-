import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, resolveResultLimit } from "@/lib/api-client";
import { MAX_UPLOAD_BYTES, validateUploads } from "@/lib/upload-validation";
import { extractHighlightTerms } from "@/lib/highlight";
import { compileQueryTrace } from "@/lib/compiler-engine";
import { sanitizePdfPageText, validateExtractedPdfText } from "@/lib/extractors/client-extractors";

const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

describe("validateUploads", () => {
  it("accepts every advertised document and code extension", () => {
    const supported = [".pdf", ".docx", ".txt", ".py", ".java", ".js", ".jsx"];
    const { valid, rejected } = validateUploads(
      supported.map((extension, index) => file(`sample-${index}${extension}`, 10))
    );
    expect(valid.map((item) => item.name)).toHaveLength(supported.length);
    expect(rejected).toHaveLength(0);
  });

  it("rejects unsupported extensions, empty files, oversize files and extension-less names", () => {
    const { valid, rejected } = validateUploads([
      file("x.exe", 10),
      file("empty.txt", 0),
      file("huge.pdf", MAX_UPLOAD_BYTES + 1),
      file("README", 10),
      file("ok.java", 10),
    ]);
    expect(valid.map((f) => f.name)).toEqual(["ok.java"]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "unsupported file type",
      "file is empty",
      "larger than 20 MB",
      "unsupported file type",
    ]);
  });

  it("accepts a file of exactly the maximum size", () => {
    expect(validateUploads([file("edge.txt", MAX_UPLOAD_BYTES)]).valid).toHaveLength(1);
  });
});

describe("extractHighlightTerms", () => {
  it("drops stop words and short words, lower-cases and de-duplicates", () => {
    expect(extractHighlightTerms("Find Python functions that process CSV csv files")).toEqual([
      "python",
      "functions",
      "process",
      "csv",
      "files",
    ]);
  });
  it("returns an empty list for empty input", () => {
    expect(extractHighlightTerms("")).toEqual([]);
  });
});

describe("ApiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("flags an unreachable server as a network ApiError with a helpful message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = new ApiClient("http://example.test");
    const err = await api.search("q").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.network).toBe(true);
    expect(err.message).toMatch(/Cannot reach the backend at http:\/\/example\.test/);
  });

  it("surfaces the FastAPI `detail` string on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ detail: "Query cannot be empty." }) })
    );
    const err = await new ApiClient("http://x").explain("").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.network).toBe(false);
    expect(err.status).toBe(400);
    expect(err.message).toBe("Query cannot be empty.");
  });

  it("reads the first message of a FastAPI validation-error array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: [{ msg: "field required" }] }) })
    );
    const err = await new ApiClient("http://x").search("q").catch((e) => e);
    expect(err.message).toBe("field required");
  });

  it("falls back to the default message when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      })
    );
    const err = await new ApiClient("http://x").listFiles().catch((e) => e);
    expect(err.message).toBe("Failed to list indexed files");
  });

  it("sends the documented search payload with defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await new ApiClient("http://x").search("hello", { mode: "lexical", limit: 5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/api/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ query: "hello", mode: "lexical", kind: "all", type: "ALL", limit: 5 });
  });

  it("URL-encodes file ids on delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deleted: "x", status: "removed" }) });
    vi.stubGlobal("fetch", fetchMock);
    await new ApiClient("http://x").deleteFile("a/b c");
    expect(fetchMock.mock.calls[0][0]).toBe("http://x/api/files/a%2Fb%20c");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("local compiler approximation (offline fallback only)", () => {
  it("produces a structurally complete trace", () => {
    const t = compileQueryTrace("Find Python functions that process CSV files");
    expect(t.tokens.length).toBeGreaterThan(3);
    expect(t.ast.language).toBe("python");
    expect(t.stages.length).toBeGreaterThanOrEqual(7);
    expect(t.optimizedIr.limit).toBeGreaterThan(0);
  });
});


describe("search result limits", () => {
  it("uses the saved preference unless the query explicitly requests a count", () => {
    expect(resolveResultLimit("Find Python functions", 20)).toBe(20);
    expect(resolveResultLimit("Find the top 50 Python functions", 10)).toBe(50);
    expect(resolveResultLimit("show 200 results", 10)).toBe(100);
    expect(resolveResultLimit("limit 0", 10)).toBe(1);
  });
});

describe("PDF text quality", () => {
  it("removes PDF trailer syntax and long encoded payload lines", () => {
    const payload = "A".repeat(220);
    const cleaned = sanitizePdfPageText(
      "Python functions process CSV rows and validate their columns.\n" +
      "startxref\n12345\n%%EOF\n" +
      payload
    );
    expect(cleaned).toContain("Python functions process CSV rows");
    expect(cleaned).not.toContain("startxref");
    expect(cleaned).not.toContain("%%EOF");
    expect(cleaned).not.toContain(payload);
  });

  it("rejects a PDF whose extracted text is only structural metadata", () => {
    expect(() => validateExtractedPdfText("xref trailer startxref %%EOF endobj")).toThrow(
      /no readable text layer/i
    );
  });

  it("preserves readable technical text, identifiers, and mathematical symbols", () => {
    const source = "Python function process_csv(file_path) reads CSV rows, checks x >= 0, and returns parsed records.";
    expect(validateExtractedPdfText(source)).toContain("process_csv");
    expect(validateExtractedPdfText(source)).toContain("x >= 0");
  });
});
