import mammoth from "mammoth";
import { chunkProseText, chunkSourceCode, type DocumentChunkSpec } from "../chunking/chunker";

export interface ExtractedFileResult {
  fileName: string;
  fileSize: number;
  fileType: string;
  contentKind: "document" | "code";
  rawText: string;
  chunks: DocumentChunkSpec[];
}

const CODE_EXTENSIONS = new Set([
  "py", "java", "js", "jsx", "ts", "tsx", "c", "cpp", "h", "cs",
  "go", "rs", "php", "rb", "sql", "html", "css", "sh",
]);

const LANGUAGE_MAP: Record<string, string> = {
  py: "python", java: "java", js: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", sql: "sql", html: "html",
  css: "css", sh: "shell", rb: "ruby", go: "go", rs: "rust",
  cpp: "cpp", c: "c", cs: "csharp",
};

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function isCodeFile(filename: string): boolean {
  return CODE_EXTENSIONS.has(getFileExtension(filename));
}

const PDF_STRUCTURAL_LINE = /^(?:%%EOF\b|xref\b|trailer\b|startxref\b|endobj\b|endstream\b|stream\b|\d+\s+\d+\s+obj\b|\/(?:Type|Root|Info|Length|XRef)\b)/i;

/** Remove obvious PDF container syntax and long encoded payloads, not document prose/code. */
export function sanitizePdfPageText(text: string): string {
  const cleanedLines = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => {
      if (!line || PDF_STRUCTURAL_LINE.test(line)) return false;
      const compact = line.replace(/\s/g, "");
      const encodedRatio = compact.length
        ? (compact.match(/[A-Za-z0-9+/=_-]/g) || []).length / compact.length
        : 0;
      if (compact.length >= 160 && encodedRatio > 0.985 && !/[.!?;:]\s/.test(line)) return false;
      return true;
    });

  const normalized = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const structuralMarkers = (normalized.match(/(?:%%EOF|startxref|\bxref\b|\btrailer\b|\bendobj\b|\bendstream\b)/gi) || []).length;
  const wordCount = (normalized.match(/[\p{L}\p{N}]+/gu) || []).length;
  if (structuralMarkers >= 3 && structuralMarkers / Math.max(wordCount, 1) > 0.04) return "";
  return normalized;
}

/** Reject empty, scanned, or metadata-only PDFs instead of indexing unusable text. */
export function validateExtractedPdfText(text: string): string {
  const normalized = sanitizePdfPageText(text).replace(/[ \t]+/g, " ").trim();
  const alphanumericCount = (normalized.match(/[\p{L}\p{N}]/gu) || []).length;
  if (normalized.length < 30 || alphanumericCount < 20) {
    throw new Error(
      "This PDF has no readable text layer (it may be scanned, image-only, or contain only PDF metadata). It was not indexed. Please use a text-based PDF."
    );
  }
  return normalized;
}

/**
 * Extract PDF text with PDF.js. Never decode the raw PDF byte stream as text:
 * compressed streams, font encodings and object metadata are not document text.
 */
async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const rawPageText = content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("");
      const pageText = sanitizePdfPageText(rawPageText);
      if (pageText) pages.push(pageText);
    }
  } finally {
    await document.destroy();
  }

  validateExtractedPdfText(pages.join("\n\n"));
  return pages;
}

/** Extracts text and chunks from a browser File object. */
export async function extractFileInBrowser(file: File): Promise<ExtractedFileResult> {
  const ext = getFileExtension(file.name);
  const isCode = isCodeFile(file.name);
  const contentKind = isCode ? "code" : "document";
  let rawText = "";
  let pdfPages: string[] | null = null;

  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    rawText = result.value || "";
  } else if (ext === "pdf") {
    pdfPages = await extractPdfText(await file.arrayBuffer());
    rawText = pdfPages.join("\n\n");
  } else {
    rawText = await file.text();
  }

  if (!rawText.trim()) {
    throw new Error(`No readable text could be extracted from "${file.name}". The file was not indexed.`);
  }

  const chunks = pdfPages
    ? pdfPages.flatMap((pageText, index) => chunkProseText(pageText, index + 1))
    : isCode
      ? chunkSourceCode(rawText, file.name, LANGUAGE_MAP[ext] || ext)
      : chunkProseText(rawText);

  if (chunks.length === 0) {
    throw new Error(`No searchable text was extracted from "${file.name}". The file was not indexed.`);
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: ext.toUpperCase() || "TXT",
    contentKind,
    rawText,
    chunks,
  };
}
