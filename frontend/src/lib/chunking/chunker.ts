/**
 * Document and code chunking utilities ported from Python chunking pipeline.
 */

export function splitIdentifier(identifier: string): string {
  const spaced = identifier.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.replace(/[_\s]+/g, " ").trim();
}

export function searchableCode(
  symbolName: string,
  signature: string,
  documentation: string,
  identifiers: string[],
  source: string
): string {
  const parts = [
    symbolName,
    splitIdentifier(symbolName),
    signature,
    documentation,
    identifiers.map(splitIdentifier).join(" "),
    source,
  ];
  return parts.filter(Boolean).join("\n");
}

export interface DocumentChunkSpec {
  chunkText: string;
  sourceKind: "document" | "code";
  pageNumber?: number;
  lineStart?: number;
  lineEnd?: number;
  symbolName?: string;
  symbolKind?: string;
  language?: string;
  identifiers: string[];
}

/**
 * Splits prose text into sliding-window word chunks.
 * Default: 180 words with 30 words overlap (matching Python chunk_documents).
 */
export function chunkProseText(
  text: string,
  pageNumber: number = 1,
  maxWords: number = 180,
  overlapWords: number = 30
): DocumentChunkSpec[] {
  const words = text.match(/\S+/g) || [];
  if (words.length === 0) return [];

  const chunks: DocumentChunkSpec[] = [];
  const step = Math.max(1, maxWords - overlapWords);

  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + maxWords);
    if (slice.length === 0) break;

    chunks.push({
      chunkText: slice.join(" "),
      sourceKind: "document",
      pageNumber,
      identifiers: [],
    });

    if (start + maxWords >= words.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Splits source code into line-aware chunks.
 * Default: 250 lines with 20 lines overlap (matching Python chunk_code_symbols).
 */
export function chunkSourceCode(
  code: string,
  fileName: string,
  language: string,
  maxLines: number = 250,
  overlapLines: number = 20
): DocumentChunkSpec[] {
  const lines = code.split(/\r?\n/);
  if (lines.length === 0) return [];

  // Identify top-level classes or functions using regex heuristics
  const chunks: DocumentChunkSpec[] = [];
  const step = Math.max(1, maxLines - overlapLines);

  // Extract identifiers from code (variable/function/class names)
  const idRegex = /[A-Za-z_][A-Za-z0-9_]{2,}/g;
  const allIds = Array.from(new Set(code.match(idRegex) || [])).slice(0, 50);

  for (let start = 0; start < lines.length; start += step) {
    const selected = lines.slice(start, start + maxLines);
    if (selected.length === 0) break;

    const startLine = start + 1;
    const endLine = start + selected.length;
    const content = selected.join("\n");

    // Check if chunk contains function or class definition
    let symbolKind: string | undefined;
    let symbolName: string | undefined;

    const classMatch = content.match(/class\s+([A-Za-z0-9_]+)/);
    const funcMatch = content.match(/(?:def|function|async\s+function|const|let|public|private)\s+([A-Za-z0-9_]+)/);

    if (classMatch) {
      symbolKind = "class";
      symbolName = classMatch[1];
    } else if (funcMatch) {
      symbolKind = "function";
      symbolName = funcMatch[1];
    }

    const chunkIdentifiers = allIds.filter((id) => content.includes(id)).slice(0, 20);
    const enrichedText = searchableCode(
      symbolName || fileName,
      "",
      "",
      chunkIdentifiers,
      content
    );

    chunks.push({
      chunkText: enrichedText,
      sourceKind: "code",
      lineStart: startLine,
      lineEnd: endLine,
      symbolName,
      symbolKind,
      language: language.toLowerCase(),
      identifiers: chunkIdentifiers,
    });

    if (start + maxLines >= lines.length) {
      break;
    }
  }

  return chunks;
}
