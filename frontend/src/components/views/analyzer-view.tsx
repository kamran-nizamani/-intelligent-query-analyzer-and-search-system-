"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Play,
  Terminal,
} from "lucide-react";
import type { CompilerTrace, CompilerToken } from "@/types/search";
import { compileQueryTrace } from "@/lib/compiler-engine";
import { apiClient, ApiError } from "@/lib/api-client";
import { sampleQueries } from "@/data/example-queries";
import { TraceSourceNotice, type TraceSource } from "../ui/trace-source-notice";

interface AnalyzerViewProps {
  initialQuery?: string;
  onExecuteInSearch?: (q: string) => void;
}

export function AnalyzerView({
  initialQuery = "Find Python functions that process CSV files",
  onExecuteInSearch,
}: AnalyzerViewProps) {
  const [inputQuery, setInputQuery] = useState(initialQuery);
  const [trace, setTrace] = useState<CompilerTrace | null>(null);
  const [source, setSource] = useState<TraceSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const [selectedToken, setSelectedToken] = useState<CompilerToken | null>(null);
  const [activeTab, setActiveTab] = useState<"tokens" | "ast" | "semantic" | "ir" | "optimizer">("tokens");
  const [compiling, setCompiling] = useState(false);

  const handleCompile = useCallback(async (qToCompile: string) => {
    const text = qToCompile.trim();
    if (!text) return;
    const seq = ++requestSeq.current;
    setCompiling(true);
    setError(null);
    try {
      const realTrace = await apiClient.explain(text);
      if (seq !== requestSeq.current) return;
      setTrace(realTrace);
      setSource("backend");
    } catch (err) {
      if (seq !== requestSeq.current) return;
      const message = err instanceof Error ? err.message : "Compiler request failed";
      setError(message);
      if (err instanceof ApiError && !err.network) {
        // The backend understood and rejected the query: show that, not a guess.
        setTrace(null);
        setSource(null);
      } else {
        // Backend unreachable: offer a clearly-labelled local approximation.
        setTrace(compileQueryTrace(text));
        setSource("local-fallback");
      }
    } finally {
      if (seq === requestSeq.current) {
        setCompiling(false);
        setSelectedToken(null);
      }
    }
  }, []);

  // Compile when the app hands us a (new) query; typing in the box does not trigger this.
  useEffect(() => {
    setInputQuery(initialQuery);
    void handleCompile(initialQuery);
  }, [initialQuery, handleCompile]);

  const tokenColors: Record<string, { bg: string; text: string; border: string }> = {
    ACTION: { bg: "rgba(99, 102, 241, 0.15)", text: "var(--tok-action)", border: "rgba(99, 102, 241, 0.4)" },
    TARGET: { bg: "rgba(16, 185, 129, 0.15)", text: "var(--tok-target)", border: "rgba(16, 185, 129, 0.4)" },
    LANGUAGE: { bg: "rgba(59, 130, 246, 0.15)", text: "var(--tok-language)", border: "rgba(59, 130, 246, 0.4)" },
    RELATION: { bg: "rgba(245, 158, 11, 0.15)", text: "var(--tok-relation)", border: "rgba(245, 158, 11, 0.4)" },
    LIMIT: { bg: "rgba(236, 72, 153, 0.15)", text: "var(--tok-limit)", border: "rgba(236, 72, 153, 0.4)" },
    NUMBER: { bg: "rgba(168, 85, 247, 0.15)", text: "var(--tok-number)", border: "rgba(168, 85, 247, 0.4)" },
    WORD: { bg: "rgba(148, 163, 184, 0.15)", text: "var(--tok-word)", border: "rgba(148, 163, 184, 0.4)" },
    PHRASE: { bg: "rgba(20, 184, 166, 0.15)", text: "var(--tok-phrase)", border: "rgba(20, 184, 166, 0.4)" },
    EOF: { bg: "rgba(100, 116, 139, 0.15)", text: "var(--tok-eof)", border: "rgba(100, 116, 139, 0.4)" },
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Terminal size={22} style={{ color: "var(--accent-text)" }} />
            <h1 className="page-title">Query Analyzer</h1>
          </div>

          {onExecuteInSearch && (
            <button
              onClick={() => onExecuteInSearch(inputQuery)}
              className="btn-primary"
              style={{ fontSize: 12 }}
            >
              <span>Execute in Search Workspace</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
        <p className="page-description">
          Demonstrates compiler front-end query decomposition: Lexical Scanner, Recursive-Descent
          Parser, Abstract Syntax Tree (AST), Semantic Type Resolution, and Optimized QueryIR.
        </p>
      </div>

      {/* Query Compile Input */}
      <div className="surface-card" style={{ marginBottom: 20 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCompile(inputQuery);
          }}
          style={{ display: "flex", gap: 10, alignItems: "center" }}
        >
          <div
            className="search-input-box"
            style={{ flex: 1, padding: "10px 14px", boxShadow: "none" }}
          >
            <Terminal size={16} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              aria-label="Query to analyze"
              placeholder="Enter a natural-language query to analyze with compiler engine..."
              className="search-main-input"
            />
          </div>

          <button type="submit" className="btn-primary" style={{ padding: "10px 18px" }} disabled={compiling || !inputQuery.trim()}>
            <Play size={14} />
            <span>{compiling ? "Compiling..." : "Compile & Analyze"}</span>
          </button>
        </form>

        {/* Query Presets */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700 }}>Presets:</span>
          {sampleQueries.map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => {
                setInputQuery(sq);
                void handleCompile(sq);
              }}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                color: inputQuery === sq ? "var(--accent-text)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      <TraceSourceNotice source={source} error={error} />

      {error && source === null && (
        <div role="alert" data-testid="analyzer-error" className="backend-banner" style={{ margin: "0 0 20px" }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>Query rejected by the compiler.</strong> {error}
          </div>
        </div>
      )}

      {!trace && !error && (
        <div className="surface-card" role="status" style={{ textAlign: "center", color: "var(--text-muted)" }}>
          {compiling ? "Compiling…" : "Enter a query and choose Compile & Analyze."}
        </div>
      )}

      {trace && (<>
      {/* Compilation Summary Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="metric-card" style={{ padding: "12px 14px" }}>
          <span className="metric-label">Compiler Status</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <CheckCircle2 size={16} aria-hidden="true" style={{ color: source === "backend" ? "var(--success)" : "var(--warning)" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)" }}>
              {source === "backend" ? "Compiled by backend" : "Local approximation"}
            </span>
          </div>
        </div>

        <div className="metric-card" style={{ padding: "12px 14px" }}>
          <span className="metric-label">Total Tokens</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-main)", marginTop: 4 }}>
            {trace.tokens.length}
          </div>
        </div>

        <div className="metric-card" style={{ padding: "12px 14px" }}>
          <span className="metric-label">AST Target & Language</span>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-text)", marginTop: 4 }}>
            {trace.ast.target || "any"} · {trace.ast.language || "all"}
          </div>
        </div>

        <div className="metric-card" style={{ padding: "12px 14px" }}>
          <span className="metric-label">Active IR Filters</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-main)", marginTop: 4 }}>
            {Object.keys(trace.optimizedIr.filters).length}
          </div>
        </div>

        <div className="metric-card" style={{ padding: "12px 14px" }}>
          <span className="metric-label">Compile time</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--success)", marginTop: 4 }}>
            {trace.totalCompilationTimeMs} ms
          </div>
        </div>
      </div>

      {/* Compiler Inspector Tabs */}
      <div
        role="tablist"
        aria-label="Compiler stages"
        style={{
          display: "flex",
          overflowX: "auto",
          borderBottom: "1px solid var(--border-card)",
          marginBottom: 18,
          gap: 6,
        }}
      >
        {[
          { id: "tokens", label: "1. Token Stream", count: trace.tokens.length },
          { id: "ast", label: "2. Abstract Syntax Tree (AST)" },
          { id: "semantic", label: "3. Semantic Analysis" },
          { id: "ir", label: "4. Intermediate Representation (IR)" },
          { id: "optimizer", label: "5. IR Optimizer" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              whiteSpace: "nowrap",
              padding: "9px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--text-main)" : "var(--text-muted)",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Token Stream */}
      {activeTab === "tokens" && (
        <div className="surface-card" role="tabpanel" id="panel-tokens" aria-labelledby="tab-tokens">
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
              Lexical Analysis Token Stream
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Hover or click on individual tokens to view lexical details, character positions, and category invariants.
            </p>
          </div>

          {/* Token Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {trace.tokens.map((token, index) => {
              const color = tokenColors[token.kind] || tokenColors.WORD;
              const isSelected = selectedToken === token;
              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedToken(token)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    background: isSelected ? "var(--accent-primary)" : color.bg,
                    color: isSelected ? "#fff" : color.text,
                    border: `1px solid ${isSelected ? "var(--accent-primary)" : color.border}`,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 800 }}>{token.kind}:</span>
                  <span style={{ fontWeight: 600 }}>&quot;{token.lexeme || token.value}&quot;</span>
                </button>
              );
            })}
          </div>

          {/* Token Detail Panel */}
          {selectedToken ? (
            <div
              style={{
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 16px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                Selected Token Metadata
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, fontSize: 12 }}>
                <div>Kind: <strong style={{ color: "var(--accent-text)", fontFamily: "var(--font-mono)" }}>{selectedToken.kind}</strong></div>
                <div>Normalized Value: <strong style={{ color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>{selectedToken.value}</strong></div>
                <div>Lexeme: <strong style={{ color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>&quot;{selectedToken.lexeme}&quot;</strong></div>
                <div>Start Position: <strong style={{ color: "var(--info)", fontFamily: "var(--font-mono)" }}>Index {selectedToken.position}</strong></div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>
              Click any token above to inspect position and lexeme data.
            </div>
          )}
        </div>
      )}

      {/* Tab 2: AST Tree */}
      {activeTab === "ast" && (
        <div className="surface-card" role="tabpanel" id="panel-ast" aria-labelledby="tab-ast">
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
              Abstract Syntax Tree (AST)
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Structured node hierarchy produced by recursive-descent parsing over grammar constraints.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            {/* Visual AST Node Tree */}
            <div
              style={{
                background: "var(--bg-code)",
                padding: 16,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                lineHeight: 1.8,
              }}
            >
              <div style={{ color: "#818cf8", fontWeight: 700 }}>QueryAST [Root]</div>
              <div style={{ paddingLeft: 18, borderLeft: "1px dashed var(--border-card)" }}>
                <div>├─ action: <span style={{ color: "#34d399" }}>&quot;{trace.ast.action}&quot;</span></div>
                <div>├─ target: <span style={{ color: trace.ast.target ? "#fbbf24" : "var(--text-faint)" }}>{trace.ast.target ? `"${trace.ast.target}"` : "None"}</span></div>
                <div>├─ language: <span style={{ color: trace.ast.language ? "#60a5fa" : "var(--text-faint)" }}>{trace.ast.language ? `"${trace.ast.language}"` : "None"}</span></div>
                <div>├─ topic: <span style={{ color: "#f472b6" }}>&quot;{trace.ast.topic}&quot;</span></div>
                <div>├─ limit: <span style={{ color: "#c084fc" }}>{trace.ast.limit}</span></div>
                <div>└─ source_text: <span style={{ color: "var(--text-muted)" }}>&quot;{trace.ast.sourceText}&quot;</span></div>
              </div>
            </div>

            {/* JSON Dataclass representation */}
            <div
              style={{
                background: "var(--bg-code)",
                padding: 16,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                Python Dataclass asdict(self)
              </div>
              <pre style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "#a5b4fc", overflowX: "auto" }}>
{JSON.stringify(trace.ast, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Semantic Analysis */}
      {activeTab === "semantic" && (
        <div className="surface-card" role="tabpanel" id="panel-semantic" aria-labelledby="tab-semantic">
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
              Semantic Validation & Invariant Checking
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Validates semantic invariants: vocabulary presence, symbol resolution, and type/target coherence.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                borderRadius: 6,
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Target Symbol Resolution</strong>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  Checks if requested symbol type exists in index schemas
                </div>
              </div>
              <span className="badge badge-lexical">
                {trace.semanticStatus.targetResolved ? `Resolved: ${trace.semanticStatus.targetResolved}` : "General (Unrestricted)"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                borderRadius: 6,
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Language Scope Invariant</strong>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  Ensures target language is compatible with target symbol type
                </div>
              </div>
              <span className="badge badge-semantic">
                {trace.semanticStatus.languageResolved ? `Language: ${trace.semanticStatus.languageResolved}` : "All Languages"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                borderRadius: 6,
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Search Vocabulary Invariant</strong>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  Checks the query against the compiler&apos;s supported query vocabulary
                </div>
              </div>
              <span className="badge badge-lexical">
                {trace.semanticStatus.valid ? "Valid" : "Invalid"} · &quot;{trace.ast.topic}&quot;
              </span>
            </div>

            {trace.semanticStatus.warnings.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 12,
                  borderRadius: 6,
                  background: "var(--warning-subtle)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                <AlertTriangle size={16} style={{ color: "var(--warning)", marginTop: 2 }} />
                <div>
                  <strong style={{ fontSize: 12.5, color: "var(--warning)" }}>Semantic Warning</strong>
                  {trace.semanticStatus.warnings.map((w, idx) => (
                    <div key={idx} style={{ fontSize: 11.5, color: "var(--text-main)" }}>{w}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Intermediate Representation (IR) */}
      {activeTab === "ir" && (
        <div className="surface-card" role="tabpanel" id="panel-ir" aria-labelledby="tab-ir">
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
              Intermediate Representation (QueryIR)
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Engine-agnostic intermediate representation specifying retrieval operation, metadata filter dictionary, and dual query channels.
            </p>
          </div>

          <div
            style={{
              background: "var(--bg-code)",
              padding: 16,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              marginBottom: 16,
            }}
          >
            <pre style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "#34d399", overflowX: "auto" }}>
{JSON.stringify(trace.ir, null, 2)}
            </pre>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={{ background: "var(--bg-card-subtle)", padding: 12, borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700 }}>OPERATION</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-main)", marginTop: 4 }}>
                {trace.ir.operation}
              </div>
            </div>
            <div style={{ background: "var(--bg-card-subtle)", padding: 12, borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700 }}>FUSION ALGORITHM</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-text)", marginTop: 4 }}>
                Reciprocal Rank Fusion ({trace.ir.fusion.toUpperCase()}) k=60
              </div>
            </div>
            <div style={{ background: "var(--bg-card-subtle)", padding: 12, borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700 }}>DUAL QUERIES</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Lexical BM25 + Dense FAISS MiniLM
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Optimizer */}
      {activeTab === "optimizer" && (
        <div className="surface-card" role="tabpanel" id="panel-optimizer" aria-labelledby="tab-optimizer">
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
              Query IR Optimizer (Before vs. After)
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Applies filter canonicalization, key sorting for cache predictability, and whitespace collapse.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                Before Optimization (Raw IR)
              </div>
              <div
                style={{
                  background: "var(--bg-code)",
                  padding: 14,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <pre style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "#f87171", overflowX: "auto" }}>
{JSON.stringify(trace.ir, null, 2)}
                </pre>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                After Optimization (Normalized IR)
              </div>
              <div
                style={{
                  background: "var(--bg-code)",
                  padding: 14,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                <pre style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "#34d399", overflowX: "auto" }}>
{JSON.stringify(trace.optimizedIr, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
