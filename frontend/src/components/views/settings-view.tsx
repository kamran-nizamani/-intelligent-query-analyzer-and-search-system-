"use client";

import React from "react";
import {
  Info,
  Mic,
  Moon,
  Palette,
  RotateCcw,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import type { AppSettings, SearchMode } from "@/types/search";

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onResetSettings: () => void;
}

export function SettingsView({
  settings,
  onUpdateSettings,
  onResetSettings,
}: SettingsViewProps) {
  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Settings size={22} style={{ color: "var(--accent-text)" }} />
            <h1 className="page-title">Settings & System Preferences</h1>
          </div>

          <button
            type="button"
            onClick={onResetSettings}
            className="btn-secondary"
            style={{ fontSize: 12 }}
          >
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </button>
        </div>
        <p className="page-description">
          Configure appearance theme, hybrid retrieval ranking thresholds, compiler trace overlays, and local engine parameters.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 840 }}>
        {/* Appearance Section */}
        <div className="surface-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Palette size={16} style={{ color: "var(--accent-text)" }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
              Appearance & Theme
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Theme switcher */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Interface Color Theme</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Choose between high-contrast dark charcoal mode and clean light theme
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  background: "var(--bg-card-subtle)",
                  border: "1px solid var(--border-card)",
                  borderRadius: "var(--radius-sm)",
                  padding: 3,
                  gap: 3,
                }}
              >
                <button
                  type="button"
                  aria-pressed={settings.theme === "dark"}
                  onClick={() => onUpdateSettings({ theme: "dark" })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 5,
                    border: "none",
                    background: settings.theme === "dark" ? "var(--accent-primary)" : "transparent",
                    color: settings.theme === "dark" ? "#fff" : "var(--text-muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Moon size={13} />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  aria-pressed={settings.theme === "light"}
                  onClick={() => onUpdateSettings({ theme: "light" })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 5,
                    border: "none",
                    background: settings.theme === "light" ? "var(--accent-primary)" : "transparent",
                    color: settings.theme === "light" ? "#fff" : "var(--text-muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Sun size={13} />
                  <span>Light</span>
                </button>
              </div>
            </div>

            {/* Compact mode toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Display Density</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Use compact vertical spacing for dense developer code views
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={(e) => onUpdateSettings({ compactMode: e.target.checked })}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-main)" }}>Compact mode</span>
              </label>
            </div>
          </div>
        </div>

        {/* Search Preferences Section */}
        <div className="surface-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Search size={16} style={{ color: "var(--accent-text)" }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
              Search & Retrieval Preferences
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Default mode */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Default Search Mode</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Retrieval mode preselected in the search workspace and used for searches started from other pages
                </div>
              </div>

              <select
                aria-label="Default search mode"
                value={settings.defaultSearchMode}
                onChange={(e) => onUpdateSettings({ defaultSearchMode: e.target.value as SearchMode })}
                style={{
                  background: "var(--bg-card-subtle)",
                  border: "1px solid var(--border-card)",
                  color: "var(--text-main)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 10px",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="hybrid">Hybrid (FTS5 + FAISS via RRF)</option>
                <option value="semantic">Semantic (FAISS Dense Vector Only)</option>
                <option value="lexical">Lexical (SQLite FTS5 BM25 Only)</option>
              </select>
            </div>

            {/* Results limit */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Default Results Per Query</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Maximum number of results requested from the backend for each search
                </div>
              </div>

              <select
                aria-label="Default results per query"
                value={settings.resultsPerPage}
                onChange={(e) => onUpdateSettings({ resultsPerPage: parseInt(e.target.value, 10) })}
                style={{
                  background: "var(--bg-card-subtle)",
                  border: "1px solid var(--border-card)",
                  color: "var(--text-main)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 10px",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value={5}>Top 5 Candidates</option>
                <option value={10}>Top 10 Candidates</option>
                <option value={20}>Top 20 Candidates</option>
              </select>
            </div>

            {/* Auto highlight */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Auto-Highlight Matching Phrases</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Highlight query terms inside result snippets
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.autoHighlight}
                  onChange={(e) => onUpdateSettings({ autoHighlight: e.target.checked })}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-main)" }}>Enabled</span>
              </label>
            </div>

            {/* Compiler trace drawer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Open Compiler Trace by Default</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Expand the query AST / IR panel automatically after each search
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.showCompilerDrawer}
                  onChange={(e) => onUpdateSettings({ showCompilerDrawer: e.target.checked })}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-main)" }}>Enabled</span>
              </label>
            </div>
          </div>
        </div>

        {/* Voice Preferences Section */}
        <div className="surface-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Mic size={16} style={{ color: "var(--info)" }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
              Voice Query Settings
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Voice Input Integration</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Show the microphone button in search (uses your browser&apos;s speech recognition)
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.enableVoiceInput}
                  onChange={(e) => onUpdateSettings({ enableVoiceInput: e.target.checked })}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-main)" }}>Enabled</span>
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13, color: "var(--text-main)" }}>Speech Recognition Language</strong>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Locale used by the browser Web Speech recognition engine
                </div>
              </div>

              <select
                aria-label="Speech recognition language"
                value={settings.voiceLanguage}
                onChange={(e) => onUpdateSettings({ voiceLanguage: e.target.value })}
                style={{
                  background: "var(--bg-card-subtle)",
                  border: "1px solid var(--border-card)",
                  color: "var(--text-main)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 10px",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="en-US">English (United States)</option>
                <option value="en-GB">English (United Kingdom)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Application & Architecture Info */}
        <div className="surface-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Info size={16} style={{ color: "var(--text-muted)" }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-main)" }}>
              Application & Engine Architecture
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 12 }}>
            <div style={{ padding: 12, background: "var(--bg-card-subtle)", borderRadius: 6 }}>
              <div style={{ color: "var(--text-faint)", fontWeight: 700, marginBottom: 4 }}>PRODUCT</div>
              <div style={{ color: "var(--text-main)", fontWeight: 600 }}>Intelligent Query Analyzer</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-card-subtle)", borderRadius: 6 }}>
              <div style={{ color: "var(--text-faint)", fontWeight: 700, marginBottom: 4 }}>COMPILER FRONTEND</div>
              <div style={{ color: "var(--accent-text)", fontWeight: 600 }}>7-Stage Typed AST Engine</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-card-subtle)", borderRadius: 6 }}>
              <div style={{ color: "var(--text-faint)", fontWeight: 700, marginBottom: 4 }}>HYBRID RETRIEVAL</div>
              <div style={{ color: "var(--success)", fontWeight: 600 }}>SQLite FTS5 + FAISS RRF</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-card-subtle)", borderRadius: 6 }}>
              <div style={{ color: "var(--text-faint)", fontWeight: 700, marginBottom: 4 }}>SUPPORTED FORMATS</div>
              <div style={{ color: "var(--text-main)", fontWeight: 600 }}>PDF, DOCX, TXT, PY, JAVA, JS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
