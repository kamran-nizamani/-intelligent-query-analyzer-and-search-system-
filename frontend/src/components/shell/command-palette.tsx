"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  GitBranch,
  History,
  LucideIcon,
  Search,
  Settings,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import type { NavItem } from "./sidebar";
import { sampleQueries } from "@/data/example-queries";
import { useDialog } from "@/lib/use-dialog";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectView: (view: NavItem) => void;
  onExecuteSearch: (query: string) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onSelectView,
  onExecuteSearch,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose);

  // Start each opening with an empty box.
  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  if (!isOpen) return null;

  const quickNav: Array<{ label: string; view: NavItem; icon: LucideIcon }> = [
    { label: "Intelligent Search Workspace", view: "search", icon: Search },
    { label: "Query Compiler Analyzer", view: "analyzer", icon: Terminal },
    { label: "Compiler Pipeline Visualization", view: "pipeline", icon: GitBranch },
    { label: "Document Library & Codebase", view: "library", icon: BookOpen },
    { label: "Search History Log", view: "history", icon: History },
    { label: "Analytics & Benchmarks", view: "analytics", icon: Activity },
    { label: "System Preferences & Settings", view: "settings", icon: Settings },
  ];

  const filteredQueries = sampleQueries.filter((q) =>
    q.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick search and navigation"
        className="modal-dialog"
        style={{ maxWidth: 580, padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <Search size={18} aria-hidden="true" style={{ color: "var(--accent-text)" }} />
          <input
            autoFocus
            type="text"
            aria-label="Search query or page name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                onExecuteSearch(query);
                onClose();
              }
            }}
            placeholder="Type a natural-language search query or jump to a page..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-main)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="btn-icon"
              aria-label="Clear input"
              style={{ width: 24, height: 24 }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : (
            <span className="kbd-shortcut">ESC</span>
          )}
        </div>

        {/* Action content */}
        <div style={{ maxHeight: 380, overflowY: "auto", padding: "12px 10px" }}>
          {query.trim().length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  letterSpacing: "0.5px",
                }}
              >
                Execute Direct Search
              </div>
              <button
                onClick={() => {
                  onExecuteSearch(query);
                  onClose();
                }}
                className="nav-link"
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Sparkles size={16} style={{ color: "var(--accent-text)" }} />
                  <span style={{ color: "var(--text-main)", fontWeight: 600 }}>
                    Search &quot;{query}&quot;
                  </span>
                </div>
                <span className="kbd-shortcut">↵ Enter</span>
              </button>
            </div>
          )}

          {/* Quick Query Presets */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                padding: "4px 10px",
                letterSpacing: "0.5px",
              }}
            >
              Suggested Query Prompts
            </div>
            {filteredQueries.slice(0, 3).map((sq) => (
              <button
                key={sq}
                onClick={() => {
                  onExecuteSearch(sq);
                  onClose();
                }}
                className="nav-link"
                style={{ padding: "8px 12px", fontSize: 12.5 }}
              >
                <Terminal size={14} style={{ color: "var(--info)" }} />
                <span style={{ flex: 1, textAlign: "left" }}>{sq}</span>
                <ArrowRight size={13} style={{ color: "var(--text-faint)" }} />
              </button>
            ))}
          </div>

          {/* Page Jumps */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                padding: "4px 10px",
                letterSpacing: "0.5px",
              }}
            >
              Application Views
            </div>
            {quickNav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  onClick={() => {
                    onSelectView(item.view);
                    onClose();
                  }}
                  className="nav-link"
                  style={{ padding: "8px 12px" }}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer shortcuts */}
        <div
          style={{
            padding: "8px 16px",
            background: "var(--bg-card-subtle)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span>Use natural language or syntax queries</span>
          <div style={{ display: "flex", gap: 8 }}>
            <span><span className="kbd-shortcut">↵</span> to select</span>
            <span><span className="kbd-shortcut">esc</span> to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
