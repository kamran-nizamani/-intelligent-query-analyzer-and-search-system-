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

interface PakoModule {
  inflate: (data: Uint8Array, options?: { to: "string" }) => string | Uint8Array;
  inflateRaw?: (data: Uint8Array, options?: { to: "string" }) => string | Uint8Array;
}

let pakoLib: PakoModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pakoLib = require("pako") as PakoModule;
} catch {
  // pako not in scope
}

/**
 * Decompresses a deflate/zlib byte slice using pako.
 */
function decompressDeflate(bytes: Uint8Array): string | null {
  if (pakoLib) {
    try {
      return pakoLib.inflate(bytes, { to: "string" }) as string;
    } catch {
      try {
        if (pakoLib.inflateRaw) {
          return pakoLib.inflateRaw(bytes, { to: "string" }) as string;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Parses text tokens from a decompressed PDF content stream.
 * Handles BT...ET blocks, (text) Tj, [(t1) 10 (t2)] TJ, and hex string <hex> Tj.
 */
function parsePdfContentStream(streamContent: string): string {
  const textSegments: string[] = [];

  // Match BT ... ET blocks
  const btRegex = /BT\s+([\s\S]*?)\s+ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRegex.exec(streamContent)) !== null) {
    const block = btMatch[1];
    // Match literal strings in parens (text) or hex strings <hex>
    const tokenRegex = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g;
    let tokenMatch: RegExpExecArray | null;
    const blockWords: string[] = [];

    while ((tokenMatch = tokenRegex.exec(block)) !== null) {
      if (tokenMatch[1] !== undefined) {
        // Parenthesized string with escape sequences
        const unescaped = tokenMatch[1]
          .replace(/\\([nrtbf()\\])/g, (_, c) => {
            if (c === "n") return "\n";
            if (c === "t") return "\t";
            if (c === "r") return "\r";
            return c;
          })
          .trim();
        if (unescaped) {
          blockWords.push(unescaped);
        }
      } else if (tokenMatch[2]) {
        // Hexadecimal encoded string
        try {
          const hex = tokenMatch[2];
          let str = "";
          for (let i = 0; i < hex.length; i += 2) {
            str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
          }
          if (str.trim()) {
            blockWords.push(str.trim());
          }
        } catch {
          /* ignore invalid hex */
        }
      }
    }

    if (blockWords.length > 0) {
      textSegments.push(blockWords.join(" "));
    }
  }

  // If no BT...ET blocks were found, check for standalone parenthesized strings
  if (textSegments.length === 0) {
    const rawParenRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let pm: RegExpExecArray | null;
    const standaloneWords: string[] = [];
    while ((pm = rawParenRegex.exec(streamContent)) !== null) {
      const clean = pm[1].replace(/[^\x20-\x7E\r\n\t]/g, " ").trim();
      if (clean.length > 1) {
        standaloneWords.push(clean);
      }
    }
    if (standaloneWords.length > 0) {
      textSegments.push(standaloneWords.join(" "));
    }
  }

  return textSegments.join("\n");
}

/**
 * Extracts raw text from binary PDF data, handling FlateDecode compression,
 * uncompressed text streams, and fallback tokenization.
 */
export async function extractBasicPdfText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const streamMarker = new Uint8Array([115, 116, 114, 101, 97, 109]); // "stream"
  const endMarker = new Uint8Array([101, 110, 100, 115, 116, 114, 101, 97, 109]); // "endstream"
  const extractedParts: string[] = [];

  let pos = 0;
  while (pos < bytes.length) {
    // Locate "stream"
    let streamIdx = -1;
    for (let i = pos; i <= bytes.length - 6; i++) {
      if (
        bytes[i] === streamMarker[0] &&
        bytes[i + 1] === streamMarker[1] &&
        bytes[i + 2] === streamMarker[2] &&
        bytes[i + 3] === streamMarker[3] &&
        bytes[i + 4] === streamMarker[4] &&
        bytes[i + 5] === streamMarker[5]
      ) {
        streamIdx = i;
        break;
      }
    }
    if (streamIdx === -1) break;

    // Stream start after \r\n or \n
    let dataStart = streamIdx + 6;
    if (bytes[dataStart] === 0x0d && bytes[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (bytes[dataStart] === 0x0a || bytes[dataStart] === 0x0d) {
      dataStart += 1;
    }

    // Locate "endstream"
    let endIdx = -1;
    for (let i = dataStart; i <= bytes.length - 9; i++) {
      if (
        bytes[i] === endMarker[0] &&
        bytes[i + 1] === endMarker[1] &&
        bytes[i + 2] === endMarker[2] &&
        bytes[i + 3] === endMarker[3] &&
        bytes[i + 4] === endMarker[4] &&
        bytes[i + 5] === endMarker[5] &&
        bytes[i + 6] === endMarker[6] &&
        bytes[i + 7] === endMarker[7] &&
        bytes[i + 8] === endMarker[8]
      ) {
        endIdx = i;
        break;
      }
    }
    if (endIdx === -1) break;

    let dataEnd = endIdx;
    if (bytes[dataEnd - 1] === 0x0a) dataEnd--;
    if (bytes[dataEnd - 1] === 0x0d) dataEnd--;

    if (dataEnd > dataStart) {
      const streamSlice = bytes.subarray(dataStart, dataEnd);

      // Try decompressing with Deflate
      const decompressed = decompressDeflate(streamSlice);
      if (decompressed) {
        const textFromStream = parsePdfContentStream(decompressed);
        if (textFromStream.length > 5) {
          extractedParts.push(textFromStream);
        }
      } else {
        // Check if stream is uncompressed text
        const rawString = new TextDecoder("latin1").decode(streamSlice);
        const textFromStream = parsePdfContentStream(rawString);
        if (textFromStream.length > 5) {
          extractedParts.push(textFromStream);
        }
      }
    }

    pos = endIdx + 9;
  }

  if (extractedParts.length > 0) {
    return extractedParts.join("\n\n");
  }

  // Fallback: Latin1 decoding with ASCII filtering
  const fullText = new TextDecoder("latin1").decode(buffer);
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  const parts: string[] = [];

  while ((match = streamRegex.exec(fullText)) !== null) {
    const raw = match[1];
    const clean = raw.replace(/[^\x20-\x7E\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
    if (clean.length > 20) {
      parts.push(clean);
    }
  }

  if (parts.length > 0) {
    return parts.join("\n\n");
  }

  return fullText.replace(/[^\x20-\x7E\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
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
    rawText = await extractBasicPdfText(arrayBuffer);
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
