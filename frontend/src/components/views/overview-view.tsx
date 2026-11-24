"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code2,
  FileCode2,
  FileText,
  History,
  Layers,
  Search,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import type { IndexedFile, SearchHistoryEntry } from "@/types/search";
import type { AnalyticsResponse } from "@/lib/api-client";
import type { NavItem } from "../shell/sidebar";
import { sampleQueries } from "@/data/example-queries";

interface OverviewViewProps {
  /** `null` for any of these means the backend has not provided it (shown as "–", never invented). */
  metrics: AnalyticsResponse | null;
  files: IndexedFile[] | null;
  recentHistory: SearchHistoryEntry[] | null;
  onNavigate: (view: NavItem) => void;
  onExecuteSearch: (query: string) => void;
}

export function OverviewView({
  metrics,
  files,
  recentHistory,
  onNavigate,
  onExecuteSearch,
}: OverviewViewProps) {
  const [searchInput, setSearchInput] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onExecuteSearch(searchInput.trim());
    }
  };

  const dash = "–";
  const codeFilesCount = files ? files.filter((f) => f.kind === "code").length : null;
  const docFilesCount = files ? files.filter((f) => f.kind === "document").length : null;
  const totalChunksCount = files ? files.reduce((acc, f) => acc + f.chunks, 0) : null;
  const hasLatency = !!metrics && metrics.totalSearches > 0;

  return (
    <div className="page-container">
      {/* Welcome Banner */}
      <div
        className="surface-card"
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(14, 165, 233, 0.05) 100%), var(--bg-card)",
          borderColor: "var(--border-active)",
          marginBottom: 28,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 9999,
              background: "rgba(99, 102, 241, 0.18)",
              color: "#a5b4fc",
              fontSize: 11.5,
              fontWeight: 600,
              marginBottom: 12,
              border: "1px solid rgba(99, 102, 241, 0.3)",
            }}
          >
            <Sparkles size={13} />
            <span>Compiler-Engine Hybrid Information Retrieval</span>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.7px", marginBottom: 8, color: "var(--text-main)" }}>
            Intelligent Query Analyzer & Search System
          </h1>

          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
            Unified retrieval workspace orchestrating 7 compiler construction phases—from Lexer,
            Syntax AST, and Semantic Analysis to IR Optimization, SQLite FTS5 BM25, and FAISS
            vector similarity fused with Reciprocal Rank Fusion (RRF).
          </p>

          {/* Quick Search Form */}
          <form onSubmit={handleSearchSubmit} className="search-input-box" style={{ maxWidth: 680 }}>
            <Search size={18} style={{ color: "var(--accent-text)" }} />
            <input
              type="text"
              aria-label="Search query"
              className="search-main-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ask anything across documents & code (e.g. 'Find Python functions that process CSV files')..."
            />
            <button type="submit" className="btn-primary" style={{ padding: "8px 18px" }} disabled={!searchInput.trim()}>
              <span>Search</span>
              <ArrowRight size={14} />
            </button>
          </form>

          {/* Prompt Chips */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", fontWeight: 600 }}>Try queries:</span>
            {sampleQueries.slice(0, 3).map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => onExecuteSearch(query)}
                style={{
                  background: "var(--bg-card-subtle)",
                  border: "1px solid var(--border-card)",
                  borderRadius: 9999,
                  padding: "4px 11px",
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-main)";
                  e.currentTarget.style.borderColor = "var(--accent-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border-card)";
                }}
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid-metrics">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Indexed Documents</span>
            <div className="metric-icon-wrap" style={{ background: "rgba(239, 68, 68, 0.12)", color: "#f87171" }}>
              <FileText size={16} />
            </div>
          </div>
          <div className="metric-value">{docFilesCount ?? dash}</div>
          <div className="metric-trend" style={{ color: "var(--text-muted)" }}>
            <span>PDF, DOCX, TXT formats</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Source-Code Files</span>
            <div className="metric-icon-wrap" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#60a5fa" }}>
              <Code2 size={16} />
            </div>
          </div>
          <div className="metric-value">{codeFilesCount ?? dash}</div>
          <div className="metric-trend" style={{ color: "var(--text-muted)" }}>
            <span>Python, Java, JavaScript AST</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Search Index Chunks</span>
            <div className="metric-icon-wrap" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#34d399" }}>
              <Layers size={16} />
            </div>
          </div>
          <div className="metric-value">{totalChunksCount ?? dash}</div>
          <div className="metric-trend">
            <CheckCircle2 size={12} aria-hidden="true" />
            <span>Across indexed files</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-label">Avg server time per search</span>
            <div className="metric-icon-wrap" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#fbbf24" }}>
              <Zap size={16} />
            </div>
          </div>
          <div className="metric-value">{hasLatency ? `${metrics!.avgLatencyMs} ms` : dash}</div>
          <div className="metric-trend" style={{ color: "var(--text-muted)" }}>
            <span>{hasLatency ? `Over ${metrics!.totalSearches} searches` : "No searches recorded yet"}</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: System Architecture & Recent Search Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, marginBottom: 28 }}>
        {/* System Processing Pipeline Card */}
        <div className="surface-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Terminal size={17} style={{ color: "var(--accent-text)" }} />
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
                Compiler Pipeline Engine
              </h2>
            </div>
            <button
              onClick={() => onNavigate("pipeline")}
              style={{
                fontSize: 12,
                color: "var(--accent-text)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontWeight: 600,
              }}
            >
              <span>Interactive Pipeline</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
            Natural language queries undergo syntactic tokenization, grammar parsing, semantic symbol validation, and intermediate representation (IR) optimization before hybrid dispatch.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { stage: "1. Lexical Analysis", status: "Compiler", desc: "Transforms text into typed tokens (ACTION, TARGET, LANGUAGE)" },
              { stage: "2. Syntax & AST Generation", status: "Compiler", desc: "Constructs immutable QueryAST dataclass" },
              { stage: "3. Semantic Analysis", status: "Compiler", desc: "Validates vocab, target-language compatibility" },
              { stage: "4. Intermediate Representation", status: "Compiler", desc: "Emits QueryIR(op='HYBRID_SEARCH', filters, rrf)" },
              { stage: "5. Hybrid Search Dispatch", status: "Retrieval", desc: "Dual FTS5 BM25 + FAISS Vector embeddings fused" },
            ].map((s, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  background: "var(--bg-card-subtle)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-main)" }}>{s.stage}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.desc}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 9999,
                    background: "var(--accent-subtle)",
                    color: "var(--accent-text)",
                  }}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Search Activity */}
        <div className="surface-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <History size={17} style={{ color: "var(--info)" }} />
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
                Recent Search Activity
              </h2>
            </div>
            <button
              onClick={() => onNavigate("history")}
              style={{
                fontSize: 12,
                color: "var(--accent-text)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontWeight: 600,
              }}
            >
              <span>Full History</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {!recentHistory ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>History unavailable (backend not reachable).</p>
          ) : recentHistory.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }} data-testid="overview-no-history">
              No searches yet. Run one above and it will appear here.
            </p>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(recentHistory ?? []).slice(0, 4).map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => onExecuteSearch(entry.query)}
                title="Run this search again"
                style={{
                  width: "100%",
                  textAlign: "left",
                  font: "inherit",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card-subtle)",
                  border: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-active)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-main)" }}>
                    {entry.query}
                  </span>
                  <span className="badge badge-hybrid" style={{ fontSize: 10 }}>
                    {entry.mode}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                  <span>{entry.topResultTitle || "Search completed"}</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {entry.latencyMs} ms · {entry.resultsCount} hits
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recently Uploaded & Indexed Files */}
      <div className="surface-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={17} style={{ color: "var(--accent-text)" }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
              Recently Indexed Knowledge Base
            </h2>
          </div>
          <button
            onClick={() => onNavigate("library")}
            style={{
              fontSize: 12,
              color: "var(--accent-text)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 600,
            }}
          >
            <span>Manage Library</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, textAlign: "left" }}>
            <caption className="sr-only">Most recently indexed files</caption>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase" }}>
                <th scope="col" style={{ padding: "8px 12px" }}>File Name</th>
                <th scope="col" style={{ padding: "8px 12px" }}>Type</th>
                <th scope="col" style={{ padding: "8px 12px" }}>Size</th>
                <th scope="col" style={{ padding: "8px 12px" }}>Chunks</th>
                <th scope="col" style={{ padding: "8px 12px" }}>Status</th>
                <th scope="col" style={{ padding: "8px 12px" }}>Indexed</th>
              </tr>
            </thead>
            <tbody>
              {!files || files.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "28px 12px", textAlign: "center", color: "var(--text-muted)" }} data-testid="overview-no-files">
                    {files ? "No files indexed yet. Upload some in the Document Library." : "File list unavailable (backend not reachable)."}
                  </td>
                </tr>
              ) : null}
              {(files ?? []).slice(0, 5).map((f) => {
                const isCode = f.kind === "code";
                const Icon = isCode ? FileCode2 : FileText;
                return (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-card-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <td style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon size={16} style={{ color: isCode ? "#60a5fa" : "#fb7185", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{f.name}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className={`badge badge-${isCode ? "code" : "doc"}-${f.type.toLowerCase()}`}>
                        {f.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{f.size}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {f.chunks}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--success)", fontSize: 11.5 }}>
                        <span className="status-dot" aria-hidden="true" style={{ width: 6, height: 6 }} />
                        {f.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 11.5 }}>
                      {f.updated}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
