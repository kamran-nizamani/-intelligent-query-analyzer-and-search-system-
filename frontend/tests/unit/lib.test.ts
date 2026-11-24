import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "@/lib/api-client";
import { MAX_UPLOAD_BYTES, validateUploads } from "@/lib/upload-validation";
import { extractHighlightTerms } from "@/lib/highlight";
import { compileQueryTrace } from "@/lib/compiler-engine";
import { extractBasicPdfText } from "@/lib/extractors/client-extractors";
import zlib from "zlib";

const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

describe("validateUploads", () => {
  it("accepts supported, non-empty files", () => {
    const { valid, rejected } = validateUploads([file("a.py", 10), file("B.PDF", 5), file("n.txt", 1)]);
    expect(valid).toHaveLength(3);
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
  it("does not make HTTP requests when Supabase is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const error = await new ApiClient().search("hello").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.network).toBe(true);
    expect(error.message).toMatch(/Supabase is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs the query compiler locally without calling a server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const trace = await new ApiClient().explain("Find Python functions that process CSV files");
    expect(trace.stages).toHaveLength(7);
    expect(trace.ast.language).toBe("python");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("browser-based TypeScript compiler", () => {
  it("produces a structurally complete trace", () => {
    const t = compileQueryTrace("Find Python functions that process CSV files");
    expect(t.tokens.length).toBeGreaterThan(3);
    expect(t.ast.language).toBe("python");
    expect(t.stages.length).toBeGreaterThanOrEqual(7);
    expect(t.optimizedIr.limit).toBeGreaterThan(0);
  });
});

describe("PDF FlateDecode extraction", () => {
  it("extracts text from compressed FlateDecode PDF streams", async () => {
    const streamContent = "BT /F1 12 Tf 72 712 Td (Software Requirements Specification) Tj T* [(Section 1) 20 (Introduction)] TJ ET";
    const compressed = zlib.deflateSync(Buffer.from(streamContent));
    const header = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Length 123 /Filter /FlateDecode >>\nstream\r\n");
    const footer = Buffer.from("\r\nendstream\nendobj\n%%EOF");
    const fullBuffer = Buffer.concat([header, compressed, footer]);

    const extracted = await extractBasicPdfText(fullBuffer.buffer);
    expect(extracted).toContain("Software Requirements Specification");
    expect(extracted).toContain("Section 1");
    expect(extracted).toContain("Introduction");
  });

  it("extracts text from plain uncompressed streams", async () => {
    const streamContent = "BT (Architecture Overview) Tj ET";
    const header = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Length 123 >>\nstream\r\n");
    const body = Buffer.from(streamContent);
    const footer = Buffer.from("\r\nendstream\nendobj\n%%EOF");
    const fullBuffer = Buffer.concat([header, body, footer]);

    const extracted = await extractBasicPdfText(fullBuffer.buffer);
    expect(extracted).toContain("Architecture Overview");
  });
});
