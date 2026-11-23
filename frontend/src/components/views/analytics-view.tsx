"use client";

import React from "react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  Info,
  Layers,
  Search,
  Zap,
} from "lucide-react";
import type { AnalyticsResponse, HealthResponse } from "@/lib/api-client";

interface AnalyticsViewProps {
  /** `null` when the backend has not answered. */
  metrics: AnalyticsResponse | null;
  health: HealthResponse | null;
}

const MODE_LABELS: Record<string, string> = {
  hybrid: "Hybrid (RRF)",
  semantic: "Semantic only",
  lexical: "Keyword only",
};

function Metric({
  label,
  value,
  note,
  icon,
  tint,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  tint: { bg: string; fg: string };
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon-wrap" style={{ background: tint.bg, color: tint.fg }}>
          {icon}
        </div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-trend" style={{ color: "var(--text-muted)" }}>
        <span>{note}</span>
      </div>
    </div>
  );
}

export function AnalyticsView({ metrics, health }: AnalyticsViewProps) {
  const searches = metrics?.totalSearches ?? 0;
  const dash = "–";

  const modeEntries = Object.entries(metrics?.modeBreakdown ?? {}).sort((a, b) => b[1] - a[1]);
  const modeTotal = modeEntries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={22} aria-hidden="true" style={{ color: "var(--accent-text)" }} />
            <h1 className="page-title">Analytics</h1>
          </div>
        </div>
        <p className="page-description">
          Live usage figures computed from Supabase document, chunk, and search-history records.
        </p>
      </div>

      {!metrics && (
        <div role="alert" data-testid="analytics-unavailable" className="backend-banner" style={{ margin: "0 0 20px" }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div>
            <strong>Analytics unavailable.</strong> Supabase did not return metrics, so no figures are shown.
          </div>
        </div>
      )}

      <div className="grid-metrics">
        <Metric
          label="Indexed documents"
          value={metrics ? String(metrics.totalDocuments) : dash}
          note="PDF, DOCX, TXT"
          icon={<Database size={16} aria-hidden="true" />}
          tint={{ bg: "rgba(239, 68, 68, 0.12)", fg: "#f87171" }}
        />
        <Metric
          label="Indexed code files"
          value={metrics ? String(metrics.totalCodeFiles) : dash}
          note="Python, Java, JavaScript"
          icon={<Layers size={16} aria-hidden="true" />}
          tint={{ bg: "rgba(59, 130, 246, 0.12)", fg: "#60a5fa" }}
        />
        <Metric
          label="Searchable chunks"
          value={metrics ? String(metrics.totalChunks) : dash}
          note="In PostgreSQL full-text search + pgvector"
          icon={<Cpu size={16} aria-hidden="true" />}
          tint={{ bg: "rgba(16, 185, 129, 0.12)", fg: "#34d399" }}
        />
        <Metric
          label="Searches recorded"
          value={metrics ? String(searches) : dash}
          note="Since history was last cleared"
          icon={<Search size={16} aria-hidden="true" />}
          tint={{ bg: "rgba(99, 102, 241, 0.12)", fg: "#818cf8" }}
        />
        <Metric
          label="Average search time"
          value={metrics && searches > 0 ? `${metrics.avgLatencyMs} ms` : dash}
          note={searches > 0 ? "Mean over recorded searches" : "No searches recorded yet"}
          icon={<Zap size={16} aria-hidden="true" />}
          tint={{ bg: "rgba(245, 158, 11, 0.12)", fg: "#fbbf24" }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 20, marginBottom: 24 }}>
        <div className="surface-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)", marginBottom: 6 }}>
            Searches by retrieval mode
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18 }}>
            How often each retrieval mode was used, from the recorded history.
          </p>

          {modeEntries.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No searches recorded yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {modeEntries.map(([mode, count]) => {
                const pct = modeTotal ? Math.round((count / modeTotal) * 100) : 0;
                return (
                  <div key={mode}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{MODE_LABELS[mode] ?? mode}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${MODE_LABELS[mode] ?? mode} share of searches`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      style={{ height: 8, background: "var(--bg-card-subtle)", borderRadius: 9999, overflow: "hidden" }}
                    >
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #6366f1, #3b82f6)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="surface-card">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)", marginBottom: 14 }}>
            Search engine status
          </h2>
          {health ? (
            <dl className="popover-dl" style={{ fontSize: 13 }}>
              <dt>Status</dt>
              <dd style={{ color: "var(--success)" }}>● {health.status}</dd>
              <dt>Lexical engine</dt>
              <dd>{health.fts_engine ?? "PostgreSQL full-text search"}</dd>
              <dt>Vector engine</dt>
              <dd>{health.vector_engine ?? "pgvector"}</dd>
              <dt>Embedding model</dt>
              <dd>{health.embedding_model}</dd>
              <dt>Chunks indexed</dt>
              <dd>{health.chunk_count}</dd>
              <dt>Fusion</dt>
              <dd>Reciprocal Rank Fusion</dd>
            </dl>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Supabase health is unavailable.</p>
          )}
        </div>
      </div>

      {/* Honest placeholder: the backend returns constants for these, so they are not displayed. */}
      <div className="surface-card" data-testid="quality-not-measured">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Info size={16} aria-hidden="true" style={{ color: "var(--info)" }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
            Retrieval quality (Precision@k, Recall@k, MRR)
          </h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text-main)" }}>Not measured yet.</strong> These need a labelled evaluation set
          with known-relevant results for each query. The application does not calculate these ranking-quality metrics yet; they remain unavailable until a labelled evaluation set is added.
          Planned in the evaluation phase.
        </p>
      </div>
    </div>
  );
}
