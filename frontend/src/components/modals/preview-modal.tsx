"use client";

import React, { useState } from "react";
import {
  Check,
  Copy,
  FileCode2,
  FileText,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import type { IndexedFile, SearchResult } from "@/types/search";
import { useDialog } from "@/lib/use-dialog";

interface PreviewModalProps {
  item: SearchResult | IndexedFile | null;
  onClose: () => void;
}

export function PreviewModal({ item, onClose }: PreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const dialogRef = useDialog<HTMLDivElement>(item !== null, onClose);

  if (!item) return null;

  const isSearchResult = "score" in item;
  const isCode = item.kind === "code";
  const Icon = isCode ? FileCode2 : FileText;

  const contentText = isSearchResult
    ? item.preview
    : (item as IndexedFile).contentPreview || "[No preview available for this file]";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contentText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: leave the button in its default state */
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        tabIndex={-1}
        className="modal-dialog"
        style={{ maxWidth: "min(720px, calc(100vw - 20px))", padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            <Icon size={18} style={{ color: isCode ? "var(--c-code)" : "var(--c-doc)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div id="preview-title" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)", overflowWrap: "anywhere" }}>
                {isSearchResult ? item.title : item.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>
                {item.path}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`badge badge-${isCode ? "code" : "doc"}-${item.type.toLowerCase()}`}>
              {item.type}
            </span>
            <button type="button" onClick={onClose} className="btn-icon" aria-label="Close preview">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "18px 20px", maxHeight: "65vh", overflowY: "auto" }}>
          {/* Metadata chips */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              padding: "10px 14px",
              background: "var(--bg-card-subtle)",
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            {isSearchResult && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={13} style={{ color: "var(--accent-text)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                    {item.location}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={13} style={{ color: "var(--success)" }} />
                  <span style={{ fontWeight: 600, color: "var(--success)" }}>
                    RRF score {item.score.toFixed(4)}
                  </span>
                </div>
              </>
            )}

            {!isSearchResult && (
              <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--text-muted)" }}>
                <span>Size: <strong style={{ color: "var(--text-main)" }}>{item.size}</strong></span>
                <span>Chunks: <strong style={{ color: "var(--accent-text)" }}>{item.chunks}</strong></span>
                <span>Indexed: <strong style={{ color: "var(--text-main)" }}>{item.updated}</strong></span>
              </div>
            )}
          </div>

          {/* Description if search result */}
          {isSearchResult && item.description && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
              {item.description}
            </p>
          )}

          {/* Content Preview */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                background: "var(--bg-code)",
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                border: "1px solid var(--border-subtle)",
                borderBottom: "none",
                fontSize: 11,
                color: "var(--text-faint)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span>{isCode ? "Source Code Snippet" : "Document Passage Preview"}</span>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  color: copied ? "var(--success)" : "var(--text-muted)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <pre
              style={{
                background: "var(--bg-code)",
                border: "1px solid var(--border-subtle)",
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 6,
                padding: "14px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--code-fg)",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                margin: 0,
              }}
            >
              {contentText}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 20px",
            background: "var(--bg-card-subtle)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button type="button" onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
