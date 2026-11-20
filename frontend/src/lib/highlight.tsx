import React from "react";

const STOP_WORDS = new Set([
  "a", "an", "the", "that", "which", "with", "for", "and", "or", "of", "in", "on", "to",
  "find", "show", "search", "locate", "get", "list", "me", "about", "top", "first",
]);

/** Distinct, lower-cased query terms worth emphasising (>= 3 chars, not stop words). */
export function extractHighlightTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  return Array.from(new Set(words.filter((w) => w.length >= 3 && !STOP_WORDS.has(w))));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wrap occurrences of `terms` in <mark>. Returns the plain string when there is nothing to mark. */
export function highlightText(text: string, terms: string[]): React.ReactNode {
  if (!text || terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  const lowered = new Set(terms.map((t) => t.toLowerCase()));
  return parts.map((part, i) =>
    lowered.has(part.toLowerCase()) ? (
      <mark key={i} className="hl">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}
