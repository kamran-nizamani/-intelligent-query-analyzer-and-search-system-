"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  CompilerTrace,
  IndexedFile,
  SearchHistoryEntry,
  SearchMode,
  SearchResult,
} from "@/types/search";
import { initialQuery } from "@/data/example-queries";
import {
  apiClient,
  ApiError,
  type AnalyticsResponse,
  type HealthResponse,
} from "@/lib/api-client";
import { validateUploads } from "@/lib/upload-validation";
import { yieldToMain } from "@/lib/scheduler";

import { Sidebar, type NavItem } from "./shell/sidebar";
import { Header } from "./shell/header";
import { CommandPalette } from "./shell/command-palette";
import { BackendBanner } from "./shell/backend-banner";
import { OverviewView } from "./views/overview-view";
import { SearchView } from "./views/search-view";
import { AnalyzerView } from "./views/analyzer-view";
import { PipelineView } from "./views/pipeline-view";
import { LibraryView } from "./views/library-view";
import { HistoryView } from "./views/history-view";
import { AnalyticsView } from "./views/analytics-view";
import { SettingsView } from "./views/settings-view";
import { PreviewModal } from "./modals/preview-modal";
import { Toast, type ToastTone } from "./ui/toast";

export type BackendStatus = "checking" | "online" | "offline";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  defaultSearchMode: "hybrid",
  resultsPerPage: 10,
  autoHighlight: true,
  enableVoiceInput: true,
  voiceLanguage: "en-US",
  showCompilerDrawer: false,
  compactMode: false,
};

const SETTINGS_KEY = "iqa.settings.v1";

function loadStoredSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  return DEFAULT_SETTINGS;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error";
}

export function SearchWorkspace() {
  // Navigation & view state
  const [currentView, setCurrentView] = useState<NavItem>("search");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Settings (persisted per-browser)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsLoaded = useRef(false);

  // Backend connectivity
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Search state. `results` is null until the user actually runs a search.
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState(0);
  const [trace, setTrace] = useState<CompilerTrace | null>(null);
  const [lastSearchMode, setLastSearchMode] = useState<SearchMode | null>(null);
  const searchSeq = useRef(0);

  // Backend-provided data. `null` = not loaded (never substituted with sample data).
  const [files, setFiles] = useState<IndexedFile[] | null>(null);
  const [history, setHistory] = useState<SearchHistoryEntry[] | null>(null);
  const [metrics, setMetrics] = useState<AnalyticsResponse | null>(null);

  // Overlays & feedback
  const [previewItem, setPreviewItem] = useState<SearchResult | IndexedFile | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone }>({
    message: "",
    tone: "success",
  });
  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    setToast({ message, tone });
  }, []);
  const closeToast = useCallback(() => setToast((t) => ({ ...t, message: "" })), []);

  // Restore saved settings after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    setSettings(loadStoredSettings());
    settingsLoaded.current = true;
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
    if (!settingsLoaded.current) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore: persistence is a convenience only */
    }
  }, [settings]);

  // Global shortcut: Ctrl/Cmd+K opens the palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Escape closes the mobile navigation drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  /** Load everything the backend owns. Failures leave the value `null` (unknown), never fake data. */
  const refreshBackendData = useCallback(async () => {
    const [h, f, hist, m] = await Promise.allSettled([
      apiClient.checkHealth(),
      apiClient.listFiles(),
      apiClient.getHistory(),
      apiClient.getAnalytics(),
    ]);

    if (h.status === "fulfilled") {
      setHealth(h.value);
      setBackendStatus("online");
    } else {
      setHealth(null);
      setBackendStatus("offline");
    }
    if (f.status === "fulfilled") setFiles(f.value);
    if (hist.status === "fulfilled") setHistory(hist.value);
    if (m.status === "fulfilled") setMetrics(m.value);
  }, []);

  // Load backend-owned data once on mount. Navigation must stay local and cheap:
  // refetching health, files, history, and analytics on every view change adds
  // avoidable main-thread work to sidebar clicks and can inflate INP.
  // Mutations/search flows refresh the data explicitly when it actually changes.
  useEffect(() => {
    void refreshBackendData();
  }, [refreshBackendData]);

  const handleRetryConnection = async () => {
    setBackendStatus("checking");
    await yieldToMain();
    await refreshBackendData();
  };

  const handleExecuteSearch = useCallback(
    async (searchQuery: string, mode: SearchMode = settings.defaultSearchMode) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;
      const seq = ++searchSeq.current;
      setQuery(trimmed);
      setSearchLoading(true);
      setSearchError(null);
      setCurrentView("search");
      // Yield to the browser render engine so loading states paint immediately (<16ms INP)
      await yieldToMain();

      try {
        const response = await apiClient.search(trimmed, { mode, limit: settings.resultsPerPage });
        if (seq !== searchSeq.current) return; // a newer search superseded this one
        setResults(response.results);
        setLatencyMs(response.latencyMs);
        setTrace(response.trace);
        setLastSearchMode(mode);
        setBackendStatus("online");

        // The backend records each search; refresh derived data (non-fatal if it fails).
        const [hist, m] = await Promise.allSettled([apiClient.getHistory(), apiClient.getAnalytics()]);
        if (seq !== searchSeq.current) return;
        if (hist.status === "fulfilled") setHistory(hist.value);
        if (m.status === "fulfilled") setMetrics(m.value);
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setSearchError(errorMessage(err));
        setResults(null);
        setTrace(null);
        if (err instanceof ApiError && err.network) setBackendStatus("offline");
      } finally {
        if (seq === searchSeq.current) setSearchLoading(false);
      }
    },
    [settings.defaultSearchMode, settings.resultsPerPage]
  );

  const handleUploadFiles = async (selected: File[]) => {
    const { valid, rejected } = validateUploads(selected);
    if (rejected.length > 0) {
      const detail = rejected.map((r) => `${r.name} (${r.reason})`).join(", ");
      notify(`Skipped ${rejected.length} file(s): ${detail}`, "error");
      if (valid.length === 0) return;
    }

    notify(`Uploading and indexing ${valid.length} file(s)…`);
    const failures: string[] = [];
    let succeeded = 0;

    // One request per file so a single bad file cannot hide the others' results.
    for (const file of valid) {
      try {
        await apiClient.uploadFiles([file]);
        succeeded += 1;
      } catch (err) {
        failures.push(`${file.name}: ${errorMessage(err)}`);
        if (err instanceof ApiError && err.network) {
          setBackendStatus("offline");
          break;
        }
      }
    }

    await refreshBackendData();

    if (failures.length > 0) {
      const prefix = succeeded > 0 ? `Indexed ${succeeded}, failed ${failures.length}. ` : "Upload failed. ";
      notify(prefix + failures.join(" · "), "error");
    } else if (succeeded > 0) {
      notify(`Indexed ${succeeded} file(s).`);
    }
  };

  const handleDeleteFile = async (id: string) => {
    try {
      await apiClient.deleteFile(id);
      await refreshBackendData();
      notify("File removed from the index.");
    } catch (err) {
      notify(`Failed to delete file: ${errorMessage(err)}`, "error");
    }
  };

  const handleClearHistory = async () => {
    try {
      await apiClient.clearHistory();
      setHistory([]);
      const updated = await apiClient.getAnalytics().catch(() => null);
      if (updated) setMetrics(updated);
      notify("Search history cleared.");
    } catch (err) {
      notify(`Failed to clear history: ${errorMessage(err)}`, "error");
    }
  };

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    notify("Settings reset to defaults.");
  };

  const openAnalyzerFor = (q: string) => {
    setQuery(q);
    setCurrentView("analyzer");
  };

  return (
    <div className={`app-container ${settings.compactMode ? "compact" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        totalFiles={files?.length ?? null}
        backendStatus={backendStatus}
      />

      <div className={`main-wrapper ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <Header
          currentView={currentView}
          theme={settings.theme}
          onToggleTheme={() =>
            setSettings((prev) => ({ ...prev, theme: prev.theme === "dark" ? "light" : "dark" }))
          }
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          backendStatus={backendStatus}
          health={health}
          onRetryConnection={handleRetryConnection}
        />

        <main id="main-content" tabIndex={-1} style={{ flex: 1 }}>
          {backendStatus === "offline" && <BackendBanner onRetry={handleRetryConnection} />}

          {currentView === "overview" && (
            <OverviewView
              metrics={metrics}
              files={files}
              recentHistory={history}
              onNavigate={setCurrentView}
              onExecuteSearch={handleExecuteSearch}
            />
          )}

          {currentView === "search" && (
            <SearchView
              query={query}
              onQueryChange={setQuery}
              onExecuteSearch={handleExecuteSearch}
              results={results}
              loading={searchLoading}
              error={searchError}
              latencyMs={latencyMs}
              trace={trace}
              executedMode={lastSearchMode}
              onOpenPreview={setPreviewItem}
              onOpenCompilerForQuery={openAnalyzerFor}
              onNotify={notify}
              settings={settings}
            />
          )}

          {currentView === "analyzer" && (
            <AnalyzerView initialQuery={query} onExecuteInSearch={handleExecuteSearch} />
          )}

          {currentView === "pipeline" && (
            <PipelineView initialQuery={query} onNavigateToSearch={handleExecuteSearch} />
          )}

          {currentView === "library" && (
            <LibraryView
              files={files}
              onUploadFiles={handleUploadFiles}
              onDeleteFile={handleDeleteFile}
              onPreviewFile={setPreviewItem}
            />
          )}

          {currentView === "history" && (
            <HistoryView
              history={history}
              onReRunSearch={handleExecuteSearch}
              onClearHistory={handleClearHistory}
              onAnalyzeQuery={openAnalyzerFor}
            />
          )}

          {currentView === "analytics" && <AnalyticsView metrics={metrics} health={health} />}

          {currentView === "settings" && (
            <SettingsView
              settings={settings}
              onUpdateSettings={(newVals) => setSettings((prev) => ({ ...prev, ...newVals }))}
              onResetSettings={handleResetSettings}
            />
          )}
        </main>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectView={setCurrentView}
        onExecuteSearch={handleExecuteSearch}
      />

      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />

      <Toast message={toast.message} tone={toast.tone} onClose={closeToast} />
    </div>
  );
}
