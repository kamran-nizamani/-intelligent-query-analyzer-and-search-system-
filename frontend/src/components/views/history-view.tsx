"use client";

import React, { useState } from "react";
import {
  Clock,
  History,
  RotateCcw,
  Search,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import type { SearchHistoryEntry } from "@/types/search";

interface HistoryViewProps {
  /** `null` when the backend has not provided history. */
  history: SearchHistoryEntry[] | null;
  onReRunSearch: (query: string) => void;
  onClearHistory: () => void;
  onAnalyzeQuery: (query: string) => void;
}

export function HistoryView({
  history,
  onReRunSearch,
  onClearHistory,
  onAnalyzeQuery,
}: HistoryViewProps) {
  const [filterQuery, setFilterQuery] = useState("");

  const [confirmingClear, setConfirmingClear] = useState(false);
  const all = history ?? [];
  const filteredHistory = all.filter((h) =>
    h.query.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <History size={22} style={{ color: "var(--accent-text)" }} />
            <h1 className="page-title">Search History & Query Logs</h1>
          </div>

          {all.length > 0 &&
            (confirmingClear ? (
              <div role="group" aria-label="Confirm clearing history" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Delete all {all.length} records?</span>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, color: "var(--danger)", borderColor: "var(--danger)" }}
                  onClick={() => {
                    setConfirmingClear(false);
                    onClearHistory();
                  }}
                >
                  Yes, clear
                </button>
                <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setConfirmingClear(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="btn-secondary"
                style={{ fontSize: 12, color: "var(--danger)" }}
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>Clear History</span>
              </button>
            ))}
        </div>
        <p className="page-description">
          Audit trail of natural language searches executed against the hybrid retrieval index, recording execution latency, match counts, and rank results.
        </p>
      </div>

      {/* Filter bar */}
      <div className="surface-card" style={{ marginBottom: 20, padding: 14 }}>
        <div className="search-input-box" style={{ padding: "8px 12px", boxShadow: "none" }}>
          <Search size={14} style={{ color: "var(--text-faint)" }} />
          <input
            type="text"
            aria-label="Filter search history"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search within past query history..."
            className="search-main-input"
            style={{ fontSize: 13 }}
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              className="btn-icon"
              aria-label="Clear filter"
              style={{ width: 22, height: 22 }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* History Log List */}
      {filteredHistory.length === 0 ? (
        <div
          className="surface-card"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Clock size={32} aria-hidden="true" style={{ color: "var(--text-faint)" }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }} data-testid="history-empty">
            {history === null
              ? "History unavailable"
              : all.length > 0
                ? "No matching records"
                : "No search history yet"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {history === null
              ? "The backend did not return search history."
              : all.length > 0
                ? "No recorded query contains that text."
                : "Run a search from the Search Workspace or Overview and it will be recorded here."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              className="surface-card"
              style={{
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              {/* Left query info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)", overflowWrap: "anywhere" }}>
                    &quot;{item.query}&quot;
                  </span>
                  <span className="badge badge-hybrid" style={{ fontSize: 10 }}>
                    {item.mode.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                  <span>Top Match: <strong style={{ color: "var(--text-main)" }}>{item.topResultTitle || "Matched"}</strong></span>
                  <span>•</span>
                  <span>Hits: <strong style={{ color: "var(--accent-text)" }}>{item.resultsCount}</strong></span>
                  <span>•</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>Latency: {item.latencyMs} ms</span>
                  <span>•</span>
                  <span>{item.timestamp}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onAnalyzeQuery(item.query)}
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  title="Analyze query in compiler"
                >
                  <Terminal size={13} style={{ color: "var(--accent-text)" }} />
                  <span>Inspect AST</span>
                </button>

                <button
                  type="button"
                  onClick={() => onReRunSearch(item.query)}
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "6px 14px" }}
                >
                  <RotateCcw size={13} />
                  <span>Re-run Search</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
