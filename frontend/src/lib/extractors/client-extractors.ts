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

/** Reject empty/scanned PDFs instead of silently indexing binary or unusable data. */
export function validateExtractedPdfText(text: string): string {
  const normalized = text.replace(/\u0000/g, "").replace(/[\t ]+/g, " ").trim();
  const alphanumericCount = (normalized.match(/[\p{L}\p{N}]/gu) || []).length;
  if (normalized.length < 30 || alphanumericCount < 20) {
    throw new Error(
      "This PDF has no readable text layer (it may be scanned or image-only). It was not indexed. Please use a text-based PDF."
    );
  }
  return normalized;
}

/**
 * Extract PDF text with PDF.js. Never decode the raw PDF byte stream as text:
 * compressed streams, font encodings and object metadata are not document text.
 */
async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
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
      const pageText = content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (pageText) pages.push(pageText);
    }
  } finally {
    await document.destroy();
  }

  return validateExtractedPdfText(pages.join("\n\n"));
}

/** Extracts text and chunks from a browser File object. */
export async function extractFileInBrowser(file: File): Promise<ExtractedFileResult> {
  const ext = getFileExtension(file.name);
  const isCode = isCodeFile(file.name);
  const contentKind = isCode ? "code" : "document";
  let rawText = "";

  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    rawText = result.value || "";
  } else if (ext === "pdf") {
    rawText = await extractPdfText(await file.arrayBuffer());
  } else {
    rawText = await file.text();
  }

  if (!rawText.trim()) {
    throw new Error(`No readable text could be extracted from "${file.name}". The file was not indexed.`);
  }

  const chunks = isCode
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
