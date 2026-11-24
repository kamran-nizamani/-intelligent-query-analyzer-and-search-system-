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
  "py",
  "java",
  "js",
  "jsx",
  "ts",
  "tsx",
  "c",
  "cpp",
  "h",
  "cs",
  "go",
  "rs",
  "php",
  "rb",
  "sql",
  "html",
  "css",
  "sh",
]);

const LANGUAGE_MAP: Record<string, string> = {
  py: "python",
  java: "java",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sql: "sql",
  html: "html",
  css: "css",
  sh: "shell",
  rb: "ruby",
  go: "go",
  rs: "rust",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
};

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function isCodeFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return CODE_EXTENSIONS.has(ext);
}

/**
 * Extracts raw text from simple PDF streams when native worker is unavailable.
 */
function extractBasicPdfText(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder("latin1");
  const text = decoder.decode(buffer);
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  const parts: string[] = [];

  while ((match = streamRegex.exec(text)) !== null) {
    const raw = match[1];
    // Filter printable text segments
    const clean = raw.replace(/[^\x20-\x7E\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
    if (clean.length > 20) {
      parts.push(clean);
    }
  }

  if (parts.length > 0) {
    return parts.join("\n\n");
  }

  // Fallback to ASCII filter over full buffer
  return text.replace(/[^\x20-\x7E\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extracts text and chunks from a browser File object.
 */
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
    const arrayBuffer = await file.arrayBuffer();
    rawText = extractBasicPdfText(arrayBuffer);
  } else {
    // Plain text or code file
    rawText = await file.text();
  }

  let chunks: DocumentChunkSpec[] = [];
  if (isCode) {
    const lang = LANGUAGE_MAP[ext] || ext;
    chunks = chunkSourceCode(rawText, file.name, lang);
  } else {
    chunks = chunkProseText(rawText);
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
