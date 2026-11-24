"use client";

import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  Layers,
  Mic,
  Search,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import type {
  AppSettings,
  CompilerTrace,
  SearchMode,
  SearchResult,
  SourceKind,
  SourceType,
} from "@/types/search";
import { sampleQueries } from "@/data/example-queries";
import { extractHighlightTerms, highlightText } from "@/lib/highlight";
import type { ToastTone } from "../ui/toast";

interface SearchViewProps {
  query: string;
  onQueryChange: (q: string) => void;
  onExecuteSearch: (q: string, mode?: SearchMode, kind?: "all" | SourceKind, type?: "ALL" | SourceType) => void;
  /** `null` until the user has run a search (or after a failed one). */
  results: SearchResult[] | null;
  loading: boolean;
  error: string | null;
  latencyMs: number;
  trace: CompilerTrace | null;
  /** Mode that produced the current results. */
  executedMode: SearchMode | null;
  onOpenPreview: (item: SearchResult) => void;
  onOpenCompilerForQuery: (q: string) => void;
  onNotify: (message: string, tone?: ToastTone) => void;
  settings: AppSettings;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const MODES: Array<{ id: SearchMode; label: string; icon: typeof Layers; desc: string }> = [
  { id: "hybrid", label: "Hybrid RRF", icon: Layers, desc: "PostgreSQL full-text + pgvector fused with RRF" },
  { id: "semantic", label: "Semantic Only", icon: Sparkles, desc: "pgvector / MiniLM vectors" },
  { id: "lexical", label: "Keyword Only", icon: Terminal, desc: "PostgreSQL full-text search" },
];

const KIND_OPTIONS: Array<{ id: "all" | SourceKind; label: string }> = [
  { id: "all", label: "All Content" },
  { id: "code", label: "Source Code" },
  { id: "document", label: "Documents" },
];

const TYPE_OPTIONS: Array<"ALL" | SourceType> = ["ALL", "PY", "JS", "JAVA", "PDF", "DOCX", "TXT"];

const segmentedStyle = (active: boolean, filled = false): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 5,
  border: "none",
  background: active ? (filled ? "var(--accent-primary)" : "var(--bg-card-hover)") : "transparent",
  color: active ? (filled ? "#fff" : "var(--text-main)") : "var(--text-muted)",
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
});

export function SearchView({
  query,
  onQueryChange,
  onExecuteSearch,
  results,
  loading,
  error,
  latencyMs,
  trace,
  executedMode,
  onOpenPreview,
  onOpenCompilerForQuery,
  onNotify,
  settings,
}: SearchViewProps) {
  const [selectedKind, setSelectedKind] = useState<"all" | SourceKind>("all");
  const [selectedType, setSelectedType] = useState<"ALL" | SourceType>("ALL");
  const [searchMode, setSearchMode] = useState<SearchMode>(settings.defaultSearchMode);
  const [sortOrder, setSortOrder] = useState<"relevance" | "title">("relevance");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showTraceDrawer, setShowTraceDrawer] = useState(settings.showCompilerDrawer);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Follow the saved defaults when the user changes them in Settings.
  useEffect(() => setSearchMode(settings.defaultSearchMode), [settings.defaultSearchMode]);
  useEffect(() => setShowTraceDrawer(settings.showCompilerDrawer), [settings.showCompilerDrawer]);

  // Stop any active recognition when leaving the view.
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onExecuteSearch(query.trim(), searchMode, selectedKind, selectedType);
  };

  const handleVoiceToggle = () => {
    if (voiceActive) {
      recognitionRef.current?.stop();
      setVoiceActive(false);
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      onNotify("Voice input isn't supported in this browser. Try Chrome or Edge.", "error");
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = settings.voiceLanguage;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const spoken = event.results[0]?.[0]?.transcript?.trim();
        if (spoken) {
          onQueryChange(spoken);
          onExecuteSearch(spoken, searchMode, selectedKind, selectedType);
        }
      };
      recognition.onerror = (e) => {
        setVoiceActive(false);
        onNotify(`Voice input failed: ${e.error || "microphone unavailable or permission denied"}.`, "error");
      };
      recognition.onend = () => setVoiceActive(false);
      recognitionRef.current = recognition;
      recognition.start();
      setVoiceActive(true);
    } catch {
      setVoiceActive(false);
      onNotify("Could not start voice input. Check microphone permissions.", "error");
    }
  };

  const handleCopyPath = async (path: string, id: string) => {
    try {
      await navigator.clipboard.writeText(path);
      startTransition(() => {
        setCopiedId(id);
      });
      setTimeout(() => {
        startTransition(() => {
          setCopiedId(null);
        });
      }, 2000);
    } catch {
      onNotify("Couldn't copy to the clipboard.", "error");
    }
  };

  const handleModeChange = (mode: SearchMode) => {
    setSearchMode(mode);
    // Only re-run when there is something on screen to re-run.
    if (results !== null && query.trim()) onExecuteSearch(query.trim(), mode, selectedKind, selectedType);
  };

  // The backend filters before ranking; this final pass keeps legacy API results consistent.
  const filteredResults = useMemo(() => {
    const list = (results ?? []).filter((r) => {
      if (selectedKind !== "all" && r.kind !== selectedKind) return false;
      if (selectedType !== "ALL" && r.type !== selectedType) return false;
      return true;
    });
    if (sortOrder === "title") return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return [...list].sort((a, b) => b.score - a.score);
  }, [results, selectedKind, selectedType, sortOrder]);

  const highlightTerms = useMemo(
    () =>
      settings.autoHighlight
        ? extractHighlightTerms(trace?.optimizedIr.lexicalQuery || trace?.sourceQuery || query)
        : [],
    [settings.autoHighlight, trace, query]
  );

  const hasSearched = results !== null;
  const filtersActive = selectedKind !== "all" || selectedType !== "ALL";
  const speechAvailable = settings.enableVoiceInput;

  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title">Intelligent Search Workspace</h1>
            <p className="page-description">
              Query PDF/DOCX/TXT documents and Python/Java/JavaScript source with compiler-assisted
              hybrid retrieval.
            </p>
          </div>

          {trace && (
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setShowTraceDrawer((prev) => !prev);
                });
              }}
              className="btn-secondary"
              aria-expanded={showTraceDrawer}
              aria-controls="trace-drawer"
              style={{
                fontSize: 12,
                borderColor: showTraceDrawer ? "var(--accent-primary)" : "var(--border-card)",
              }}
            >
              <Terminal size={14} aria-hidden="true" style={{ color: "var(--accent-text)" }} />
              <span>{showTraceDrawer ? "Hide Compiler Trace" : "View Query Trace"}</span>
            </button>
          )}
        </div>

        <form role="search" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          <div
            className="search-input-box"
            style={{
              padding: "14px 18px",
              flexWrap: "wrap",
              boxShadow: voiceActive ? "0 0 28px rgba(239, 68, 68, 0.35)" : "var(--shadow-md)",
              borderColor: voiceActive ? "var(--danger)" : undefined,
            }}
          >
            <Search size={20} aria-hidden="true" style={{ color: "var(--accent-text)", flexShrink: 0 }} />

            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label="Search query"
              placeholder={
                voiceActive
                  ? "Listening… speak your query now"
                  : "Enter a natural-language query, e.g. “Find Python functions that process CSV files”"
              }
              className="search-main-input"
              style={{ fontSize: 16, minWidth: 140 }}
            />

            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="btn-icon"
                aria-label="Clear query"
                style={{ width: 28, height: 28 }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}

            {speechAvailable && (
              <button
                type="button"
                onClick={handleVoiceToggle}
                className="btn-icon"
                aria-pressed={voiceActive}
                aria-label={voiceActive ? "Stop listening" : "Search by voice"}
                title={voiceActive ? "Stop listening" : "Speak your query (browser speech recognition)"}
                style={{
                  background: voiceActive ? "rgba(239, 68, 68, 0.18)" : "transparent",
                  color: voiceActive ? "var(--danger)" : "var(--text-muted)",
                }}
              >
                {voiceActive ? (
                  <AudioLines size={18} aria-hidden="true" className="animate-pulse" />
                ) : (
                  <Mic size={18} aria-hidden="true" />
                )}
              </button>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ padding: "10px 20px" }}
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <span>Searching…</span>
              ) : (
                <>
                  <span>Search</span>
                  <Sparkles size={14} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            padding: "8px 0",
          }}
        >
          <div
            role="group"
            aria-label="Retrieval mode"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              background: "var(--bg-card)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-sm)",
              padding: 3,
              gap: 3,
            }}
          >
            {MODES.map((m) => {
              const Icon = m.icon;
              const isActive = searchMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={isActive}
                  title={m.desc}
                  onClick={() => handleModeChange(m.id)}
                  style={{ ...segmentedStyle(isActive, true), display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div
              role="group"
              aria-label="Content type"
              style={{
                display: "flex",
                background: "var(--bg-card)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-sm)",
                padding: 3,
                gap: 2,
              }}
            >
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={selectedKind === k.id}
                  onClick={() => {
                    setSelectedKind(k.id);
                    if (results !== null && query.trim()) onExecuteSearch(query.trim(), searchMode, k.id, selectedType);
                  }}
                  style={{ ...segmentedStyle(selectedKind === k.id), padding: "4px 10px", fontSize: 12 }}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setShowFiltersPanel((prev) => !prev);
                });
              }}
              className="btn-secondary"
              aria-expanded={showFiltersPanel}
              aria-controls="filters-panel"
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderColor: showFiltersPanel ? "var(--accent-primary)" : undefined,
              }}
            >
              <SlidersHorizontal size={13} aria-hidden="true" />
              <span>Filters &amp; Sort</span>
            </button>
          </div>
        </div>

        {showFiltersPanel && (
          <div
            id="filters-panel"
            className="surface-card"
            style={{
              padding: "14px 18px",
              marginTop: 10,
              background: "var(--bg-card-subtle)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              gap: 20,
            }}
          >
            <div role="group" aria-labelledby="filter-type-label">
              <span
                id="filter-type-label"
                style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}
              >
                File type
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={selectedType === t}
                    onClick={() => {
                      setSelectedType(t);
                      if (results !== null && query.trim()) onExecuteSearch(query.trim(), searchMode, selectedKind, t);
                    }}
                    style={chipStyle(selectedType === t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div role="group" aria-labelledby="sort-label">
              <span
                id="sort-label"
                style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" }}
              >
                Sort by
              </span>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button
                  type="button"
                  aria-pressed={sortOrder === "relevance"}
                  onClick={() => setSortOrder("relevance")}
                  style={chipStyle(sortOrder === "relevance")}
                >
                  Relevance (score)
                </button>
                <button
                  type="button"
                  aria-pressed={sortOrder === "title"}
                  onClick={() => setSortOrder("title")}
                  style={chipStyle(sortOrder === "title")}
                >
                  Title (A–Z)
                </button>
              </div>
            </div>

            {filtersActive && (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 11.5, padding: "4px 10px", alignSelf: "flex-end" }}
                onClick={() => {
                  startTransition(() => {
                    setSelectedKind("all");
                    setSelectedType("ALL");
                  });
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {showTraceDrawer && trace && (
        <div
          id="trace-drawer"
          className="surface-card"
          style={{
            marginBottom: 20,
            background: "var(--bg-code)",
            border: "1px solid var(--accent-subtle)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Terminal size={16} aria-hidden="true" style={{ color: "var(--accent-text)" }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-main)" }}>
                Query compiler analysis
              </h2>
              <span className="badge badge-hybrid" style={{ fontSize: 10 }}>
                {trace.tokens.length} tokens
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenCompilerForQuery(query)}
              className="btn-primary"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              <span>Full Analyzer View</span>
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
            <TraceBox title="Extracted query AST" colour="var(--accent-text)" value={trace.ast} />
            <TraceBox title="Optimized query IR & filters" colour="var(--success)" value={trace.optimizedIr} />
          </div>
        </div>
      )}

      {/* Result summary (only after a search has actually run) */}
      {hasSearched && !error && (
        <div
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <div data-testid="result-summary">
            Showing <strong style={{ color: "var(--text-main)" }}>{filteredResults.length}</strong>
            {filtersActive && results ? <> of {results.length}</> : null} result
            {filteredResults.length === 1 ? "" : "s"} for{" "}
            <strong style={{ color: "var(--text-main)" }}>&quot;{trace?.sourceQuery ?? query}&quot;</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>
              Server time: <strong style={{ color: "var(--success)" }}>{latencyMs} ms</strong>
            </span>
            <span aria-hidden="true">•</span>
            <span>
              Mode:{" "}
              <strong style={{ textTransform: "capitalize", color: "var(--text-main)" }}>
                {executedMode ?? searchMode}
              </strong>
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div aria-busy="true" aria-label="Loading results" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="surface-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: "var(--border-card)" }} />
                <div style={{ width: 180, maxWidth: "50%", height: 16, borderRadius: 4, background: "var(--border-card)" }} />
              </div>
              <div style={{ width: "85%", height: 12, borderRadius: 4, background: "var(--border-subtle)", marginBottom: 8 }} />
              <div style={{ width: "100%", height: 48, borderRadius: 6, background: "var(--border-subtle)" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <StateCard
          tone="error"
          icon={<AlertTriangle size={22} aria-hidden="true" />}
          title="Search failed"
          body={error}
          testId="search-error"
          action={
            query.trim() ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onExecuteSearch(query, searchMode, selectedKind, selectedType)}
              >
                Try again
              </button>
            ) : null
          }
        />
      ) : !hasSearched ? (
        <StateCard
          icon={<Search size={22} aria-hidden="true" />}
          title="Run a search to see results"
          body="Results come from your indexed documents and code. Upload files in the Document Library first if the index is empty."
          testId="search-initial"
          action={
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {sampleQueries.slice(0, 3).map((sq) => (
                <button
                  key={sq}
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 11.5 }}
                  onClick={() => {
                    onQueryChange(sq);
                    onExecuteSearch(sq, searchMode);
                  }}
                >
                  {sq}
                </button>
              ))}
            </div>
          }
        />
      ) : filteredResults.length === 0 ? (
        <StateCard
          icon={<Search size={22} aria-hidden="true" />}
          title="No matching results"
          testId="search-empty"
          body={
            results && results.length > 0
              ? "Results exist, but none match the current filters."
              : "Nothing in the index matched this query. Try different wording, another retrieval mode, or upload more files."
          }
          action={
            filtersActive ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  startTransition(() => {
                    setSelectedKind("all");
                    setSelectedType("ALL");
                  });
                }}
              >
                Reset filters
              </button>
            ) : null
          }
        />
      ) : (
        <ul style={{ listStyle: "none" }} aria-label="Search results">
          {filteredResults.map((result) => {
            const isCode = result.kind === "code";
            const Icon = isCode ? FileCode2 : FileText;

            return (
              <li key={result.id} className="result-card" data-testid="result-card">
                <div className="result-title-row" style={{ flexWrap: "wrap" }}>
                  <h2 className="result-title" style={{ minWidth: 0, flexWrap: "wrap" }}>
                    <Icon size={18} aria-hidden="true" style={{ color: isCode ? "var(--c-code)" : "var(--c-doc)", flexShrink: 0 }} />
                    <span style={{ overflowWrap: "anywhere" }}>{result.title}</span>
                    <span className={`badge badge-${isCode ? "code" : "doc"}-${result.type.toLowerCase()}`}>
                      {result.type}
                    </span>
                    {result.symbol && (
                      <span className="badge" style={{ background: "var(--bg-card-subtle)", color: "var(--text-muted)" }}>
                        {result.symbol}
                      </span>
                    )}
                  </h2>

                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <span
                      title="Reciprocal Rank Fusion score: higher is better. Values are small by design (about 0.016–0.033 for the top ranks)."
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--accent-text)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <Sparkles size={12} aria-hidden="true" />
                      <span>Score {result.score.toFixed(4)}</span>
                    </span>

                    {result.lexicalRank != null && (
                      <span className="badge badge-lexical" style={{ fontSize: 10.5 }}>
                        Keyword #{result.lexicalRank}
                      </span>
                    )}
                    {result.semanticRank != null && (
                      <span className="badge badge-semantic" style={{ fontSize: 10.5 }}>
                        Semantic #{result.semanticRank}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {result.description && (
                    <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{result.description}</p>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "2px 8px",
                      fontSize: 11.5,
                      color: "var(--text-faint)",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{result.location}</span>
                    <span aria-hidden="true">•</span>
                    <span style={{ fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>{result.path}</span>
                  </div>
                </div>

                <div className="result-snippet-box">{highlightText(result.preview, highlightTerms)}</div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                    paddingTop: 4,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {result.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 10.5,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "var(--bg-card-subtle)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleCopyPath(result.path, result.id)}
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: "4px 8px" }}
                      aria-label={`Copy file path of ${result.title}`}
                    >
                      {copiedId === result.id ? (
                        <Check size={12} aria-hidden="true" style={{ color: "var(--success)" }} />
                      ) : (
                        <Copy size={12} aria-hidden="true" />
                      )}
                      <span>{copiedId === result.id ? "Copied" : "Copy Path"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenPreview(result)}
                      className="btn-primary"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      aria-label={`Quick preview of ${result.title}`}
                    >
                      <Eye size={12} aria-hidden="true" />
                      <span>Quick Preview</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 4,
    border: "1px solid",
    borderColor: active ? "var(--accent-primary)" : "var(--border-card)",
    background: active ? "var(--accent-subtle)" : "var(--bg-card)",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function TraceBox({ title, colour, value }: { title: string; colour: string; value: unknown }) {
  return (
    <div style={{ background: "var(--bg-card)", padding: 12, borderRadius: 6, border: "1px solid var(--border-subtle)", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-faint)", marginBottom: 6, textTransform: "uppercase" }}>
        {title}
      </div>
      <pre style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: colour, overflowX: "auto" }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function StateCard({
  icon,
  title,
  body,
  action,
  tone,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: "error";
  testId?: string;
}) {
  return (
    <div
      className="surface-card"
      role={tone === "error" ? "alert" : undefined}
      data-testid={testId}
      style={{
        padding: "48px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        borderColor: tone === "error" ? "var(--danger)" : undefined,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: tone === "error" ? "var(--danger-subtle)" : "var(--bg-card-hover)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tone === "error" ? "var(--danger)" : "var(--text-muted)",
        }}
      >
        {icon}
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-main)" }}>{title}</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 460, overflowWrap: "anywhere" }}>{body}</p>
      {action}
    </div>
  );
}
