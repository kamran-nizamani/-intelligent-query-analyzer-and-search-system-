"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  GitBranch,
  Play,
} from "lucide-react";
import type { CompilerTrace } from "@/types/search";
import { compileQueryTrace } from "@/lib/compiler-engine";
import { apiClient, ApiError } from "@/lib/api-client";
import { TraceSourceNotice, type TraceSource } from "../ui/trace-source-notice";
import { sampleQueries } from "@/data/example-queries";

interface PipelineViewProps {
  initialQuery?: string;
  onNavigateToSearch?: (q: string) => void;
}

export function PipelineView({
  initialQuery = "Find Python functions that process CSV files",
  onNavigateToSearch,
}: PipelineViewProps) {
  const [query, setQuery] = useState(initialQuery);
  const [trace, setTrace] = useState<CompilerTrace | null>(null);
  const [source, setSource] = useState<TraceSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleRunPipeline = useCallback(async (q: string) => {
    const text = q.trim();
    if (!text) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const realTrace = await apiClient.explain(text);
      if (seq !== requestSeq.current) return;
      setTrace(realTrace);
      setSource("backend");
      setSelectedStageIndex(0);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Compiler request failed");
      if (err instanceof ApiError && !err.network) {
        setTrace(null);
        setSource(null);
      } else {
        // Backend unreachable: clearly-labelled local approximation.
        setTrace(compileQueryTrace(text));
        setSource("local-fallback");
        setSelectedStageIndex(0);
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Run when the app hands us a (new) query; typing in the box does not trigger this.
  useEffect(() => {
    setQuery(initialQuery);
    void handleRunPipeline(initialQuery);
  }, [initialQuery, handleRunPipeline]);

  const selectedStage = trace ? trace.stages[selectedStageIndex] || trace.stages[0] : null;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GitBranch size={22} style={{ color: "var(--accent-text)" }} />
            <h1 className="page-title">Compiler Pipeline Visualization</h1>
          </div>

          {onNavigateToSearch && (
            <button
              onClick={() => onNavigateToSearch(query)}
              className="btn-primary"
              style={{ fontSize: 12 }}
            >
              <span>Test in Hybrid Search</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
        <p className="page-description">
          Visual trace demonstrating the seven stages of query processing: from raw lexical tokenization through AST generation, semantic validation, intermediate representation, and RRF rank fusion.
        </p>
      </div>

      {/* Query Bar */}
      <div className="surface-card" style={{ marginBottom: 24 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleRunPipeline(query);
          }}
          style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
        >
          <div className="search-input-box" style={{ flex: 1, minWidth: "min(100%, 200px)", padding: "10px 14px", boxShadow: "none" }}>
            <GitBranch size={16} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Query to run through the pipeline"
              placeholder="Run query through the 7-stage compiler pipeline..."
              className="search-main-input"
            />
          </div>
          <button type="submit" className="btn-primary" style={{ padding: "10px 18px", flexShrink: 0 }} disabled={loading || !query.trim()}>
            <Play size={14} />
            <span>{loading ? "Processing..." : "Process Query"}</span>
          </button>
        </form>

        {/* Quick query presets */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700 }}>Presets:</span>
          {sampleQueries.slice(0, 3).map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => {
                setQuery(sq);
                void handleRunPipeline(sq);
              }}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                color: query === sq ? "var(--accent-text)" : "var(--text-muted)",
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
        <div role="alert" data-testid="pipeline-error" className="backend-banner" style={{ margin: "0 0 20px" }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>Query rejected by the compiler.</strong> {error}
          </div>
        </div>
      )}

      {(!trace || !selectedStage) && !error && (
        <div className="surface-card" role="status" style={{ textAlign: "center", color: "var(--text-muted)" }}>
          {loading ? "Running pipeline…" : "Enter a query and choose Process Query."}
        </div>
      )}

      {trace && selectedStage && (<>
      {/* Interactive Horizontal Pipeline Stage Stepper */}
      <div
        className="surface-card"
        style={{
          marginBottom: 24,
          padding: "20px 16px",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minWidth: 840,
            gap: 8,
          }}
        >
          {trace.stages.map((stage, idx) => {
            const isSelected = selectedStageIndex === idx;
            const isRetrieval = stage.category === "retrieval";

            return (
              <React.Fragment key={stage.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedStageIndex(idx)}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 10px",
                    borderRadius: "var(--radius-md)",
                    background: isSelected ? "var(--bg-card-hover)" : "var(--bg-card-subtle)",
                    border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    boxShadow: isSelected ? "var(--shadow-glow)" : "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    textAlign: "center",
                    position: "relative",
                  }}
                >
                  {/* Status Indicator */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: isSelected
                        ? "var(--accent-primary)"
                        : isRetrieval
                          ? "rgba(16, 185, 129, 0.2)"
                          : "rgba(99, 102, 241, 0.2)",
                      color: isSelected
                        ? "#fff"
                        : isRetrieval
                          ? "var(--success)"
                          : "var(--accent-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {idx + 1}
                  </div>

                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-main)", whiteSpace: "nowrap" }}>
                    {stage.name.replace(/^\d+\.\s*/, "").split("(")[0].trim()}
                  </div>

                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-faint)",
                      fontFamily: "var(--font-mono)",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Clock size={10} aria-hidden="true" />
                    <span title="Nominal per-stage figure reported by the backend; not measured">~{stage.durationMs}ms</span>
                  </div>
                </button>

                {idx < trace.stages.length - 1 && (
                  <ChevronRight
                    size={16}
                    style={{ color: "var(--text-faint)", flexShrink: 0, opacity: 0.6 }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Selected Stage Deep-Dive Card */}
      <div className="surface-card" style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            borderBottom: "1px solid var(--border-subtle)",
            paddingBottom: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-sm)",
                background: "var(--accent-subtle)",
                color: "var(--accent-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {selectedStageIndex + 1}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-main)", overflowWrap: "anywhere" }}>
                {selectedStage.name}
              </h2>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                {selectedStage.summary}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span className="badge badge-lexical" style={{ fontSize: 11 }}>
              <CheckCircle2 size={12} />
              <span>Status: Completed</span>
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "var(--bg-card-subtle)",
                padding: "3px 8px",
                borderRadius: 4,
                border: "1px solid var(--border-card)",
                color: "var(--text-muted)",
              }}
            >
              Nominal: ~{selectedStage.durationMs} ms
            </span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              Measured total: {trace.totalCompilationTimeMs} ms
            </span>
          </div>
        </div>

        {/* Deep Dive Description */}
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
          {selectedStage.details}
        </p>

        {/* Input vs Output Previews */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
              Stage Input Preview
            </div>
            <div
              style={{
                background: "var(--bg-code)",
                padding: 12,
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "#e2e8f0",
                minHeight: 80,
                display: "flex",
                alignItems: "center",
              }}
            >
              {selectedStage.inputPreview}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
              Stage Output Preview
            </div>
            <div
              style={{
                background: "var(--bg-code)",
                padding: 12,
                borderRadius: 6,
                border: "1px solid rgba(16, 185, 129, 0.25)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "#34d399",
                minHeight: 80,
                display: "flex",
                alignItems: "center",
              }}
            >
              {selectedStage.outputPreview}
            </div>
          </div>
        </div>

        {/* Raw Compiler Object Inspector */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
            Raw Serialized Stage Payload
          </div>
          <div
            style={{
              background: "var(--bg-code)",
              padding: 14,
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              maxHeight: 260,
              overflowY: "auto",
            }}
            tabIndex={0}
            role="region"
            aria-label="Raw serialized stage payload"
          >
            <pre style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "#a5b4fc" }}>
{JSON.stringify(selectedStage.rawOutput, null, 2)}
            </pre>
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}
