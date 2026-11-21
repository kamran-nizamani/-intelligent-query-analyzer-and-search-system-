"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronRight,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Server,
  Sun,
} from "lucide-react";
import type { AppTheme } from "@/types/search";
import type { HealthResponse } from "@/lib/api-client";
import type { NavItem } from "./sidebar";
import { yieldToMain } from "@/lib/scheduler";

interface HeaderProps {
  currentView: NavItem;
  theme: AppTheme;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onOpenMobileNav: () => void;
  backendStatus: "checking" | "online" | "offline";
  health: HealthResponse | null;
  onRetryConnection: () => void;
}

const viewLabels: Record<NavItem, string> = {
  overview: "Overview Dashboard",
  search: "Intelligent Search Workspace",
  analyzer: "Query Analyzer",
  pipeline: "Compiler Pipeline Visualization",
  library: "Document Library",
  history: "Search History",
  analytics: "Analytics",
  settings: "Settings & Preferences",
};

const STATUS_TEXT = {
  checking: "Connecting",
  online: "Online",
  offline: "Offline",
} as const;

export function Header({
  currentView,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenMobileNav,
  backendStatus,
  health,
  onRetryConnection,
}: HeaderProps) {
  const [showStatus, setShowStatus] = useState(false);
  const statusWrapRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!showStatus) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!statusWrapRef.current?.contains(e.target as Node)) setShowStatus(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowStatus(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showStatus]);

  return (
    <header className="top-header">
      <div className="header-left">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="btn-icon mobile-nav-trigger"
          id="mobile-nav-trigger"
          aria-label="Open navigation menu"
          aria-controls="app-sidebar"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        <nav className="breadcrumb-path" aria-label="Breadcrumb">
          <span className="breadcrumb-root">Intelligent Query Analyzer</span>
          <ChevronRight size={13} aria-hidden="true" className="breadcrumb-root" style={{ color: "var(--text-faint)" }} />
          <span className="current" aria-current="page">
            {viewLabels[currentView]}
          </span>
        </nav>
      </div>

      <div className="header-right">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="header-search-bar"
          title="Quick search and navigation (Ctrl+K)"
          aria-haspopup="dialog"
        >
          <Search size={14} aria-hidden="true" />
          <span className="header-search-label">Search or jump to…</span>
          <span className="header-search-kbd" aria-hidden="true">
            <span className="kbd-shortcut">Ctrl</span>
            <span className="kbd-shortcut">K</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="btn-icon"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
        </button>

        {/* Real backend connection status (replaces the former hard-coded notification list) */}
        <div ref={statusWrapRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowStatus((prev) => !prev)}
            className="status-pill"
            data-status={backendStatus}
            data-testid="backend-status"
            aria-expanded={showStatus}
            aria-haspopup="true"
            aria-label={`Backend ${STATUS_TEXT[backendStatus]}, show details`}
          >
            <span className={`status-dot status-${backendStatus}`} aria-hidden="true" />
            <span className="status-pill-text">Backend {STATUS_TEXT[backendStatus]}</span>
          </button>

          {showStatus && (
            <div className="popover" role="region" aria-label="Backend connection details">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Server size={15} aria-hidden="true" style={{ color: "var(--accent-text)" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-main)" }}>
                  API server: {STATUS_TEXT[backendStatus]}
                </span>
              </div>

              {backendStatus === "online" && health ? (
                <dl className="popover-dl">
                  <dt>Indexed chunks</dt>
                  <dd>{health.chunk_count}</dd>
                  <dt>Embedding model</dt>
                  <dd>{health.embedding_model}</dd>
                  {health.fts_engine && (
                    <>
                      <dt>Lexical engine</dt>
                      <dd>{health.fts_engine}</dd>
                    </>
                  )}
                  {health.vector_engine && (
                    <>
                      <dt>Vector engine</dt>
                      <dd>{health.vector_engine}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 10 }}>
                  {backendStatus === "checking"
                    ? "Checking the API server…"
                    : "The API server did not respond. Start the FastAPI backend and retry."}
                </p>
              )}

              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 12, marginTop: 10 }}
                onClick={async () => {
                  await yieldToMain();
                  onRetryConnection();
                }}
              >
                <RefreshCw size={12} aria-hidden="true" />
                <span>Re-check connection</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
