import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toast } from "@/components/ui/toast";
import { Sidebar } from "@/components/shell/sidebar";
import { PreviewModal } from "@/components/modals/preview-modal";
import { SearchView } from "@/components/views/search-view";
import { LibraryView } from "@/components/views/library-view";
import { AnalyticsView } from "@/components/views/analytics-view";
import { HistoryView } from "@/components/views/history-view";
import { DEFAULT_SETTINGS } from "@/components/search-workspace";
import type { IndexedFile, SearchResult } from "@/types/search";

const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  id: "r1",
  title: "parse_csv",
  path: "/data/a.py",
  kind: "code",
  type: "PY",
  description: "lexical rank 1",
  preview: "def parse_csv(path): ...",
  location: "Lines 1–3",
  score: 0.0328,
  lexicalRank: 1,
  semanticRank: 2,
  matchType: "hybrid",
  updated: "Indexed",
  tags: ["csv"],
  ...over,
});

const file = (over: Partial<IndexedFile> = {}): IndexedFile => ({
  id: "f1",
  name: "notes.txt",
  path: "/u/notes.txt",
  kind: "document",
  type: "TXT",
  size: "1 KB",
  rawSize: 1024,
  chunks: 2,
  status: "Indexed",
  updated: "2026-01-01",
  ...over,
});

const searchProps = (over: Partial<React.ComponentProps<typeof SearchView>> = {}) => ({
  query: "csv",
  onQueryChange: vi.fn(),
  onExecuteSearch: vi.fn(),
  results: null,
  loading: false,
  error: null,
  latencyMs: 0,
  trace: null,
  executedMode: null,
  onOpenPreview: vi.fn(),
  onOpenCompilerForQuery: vi.fn(),
  onNotify: vi.fn(),
  settings: DEFAULT_SETTINGS,
  ...over,
});

describe("Toast", () => {
  it("announces errors assertively and success politely", () => {
    const { rerender } = render(<Toast message="done" onClose={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("done");
    rerender(<Toast message="boom" tone="error" onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("auto-closes once, even when the parent re-renders with a new onClose", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(<Toast message="hi" onClose={() => onClose()} duration={1000} />);
    act(() => void vi.advanceTimersByTime(600));
    rerender(<Toast message="hi" onClose={() => onClose()} duration={1000} />); // would reset the timer in the old version
    act(() => void vi.advanceTimersByTime(500));
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("Sidebar", () => {
  const base = {
    currentView: "search" as const,
    onSelectView: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
    mobileOpen: false,
    onCloseMobile: vi.fn(),
    totalFiles: 3,
    backendStatus: "online" as const,
  };

  it("marks the current page and reports the real backend state", () => {
    render(<Sidebar {...base} />);
    expect(screen.getByRole("button", { name: /Intelligent Search/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("engine-status")).toHaveTextContent("Supabase connected");
  });

  it("shows an offline state instead of a permanently green dot", () => {
    render(<Sidebar {...base} backendStatus="offline" />);
    expect(screen.getByTestId("engine-status")).toHaveTextContent("Supabase offline");
  });

  it("shows a dash, not a number, when the file count is unknown", () => {
    render(<Sidebar {...base} totalFiles={null} />);
    expect(screen.getByRole("button", { name: /Document Library/ })).toHaveTextContent("–");
  });

  it("keeps the mobile drawer expanded even if the desktop sidebar is collapsed", () => {
    render(<Sidebar {...base} collapsed mobileOpen />);
    expect(screen.getByText("Compiler & Hybrid Search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toBeInTheDocument();
  });

  it("navigates and closes the drawer on selection", async () => {
    const onSelectView = vi.fn();
    const onCloseMobile = vi.fn();
    render(<Sidebar {...base} mobileOpen onSelectView={onSelectView} onCloseMobile={onCloseMobile} />);
    await userEvent.click(screen.getByRole("button", { name: /Search History/ }));
    expect(onSelectView).toHaveBeenCalledWith("history");
    expect(onCloseMobile).toHaveBeenCalled();
  });
});

describe("PreviewModal", () => {
  it("is a labelled dialog, closes on Escape and shows the raw RRF score (not a fake percentage)", async () => {
    const onClose = vi.fn();
    render(<PreviewModal item={result()} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "parse_csv" });
    expect(within(dialog).getByText(/RRF score 0\.0328/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/%/)).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when there is no item", () => {
    const { container } = render(<PreviewModal item={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SearchView states", () => {
  it("shows an honest initial state before any search, with no results", () => {
    render(<SearchView {...searchProps()} />);
    expect(screen.getByTestId("search-initial")).toBeInTheDocument();
    expect(screen.queryByTestId("result-card")).toBeNull();
    expect(screen.queryByTestId("result-summary")).toBeNull();
  });

  it("shows the backend error and offers a retry", async () => {
    const onExecuteSearch = vi.fn();
    render(<SearchView {...searchProps({ error: "Cannot reach the backend", onExecuteSearch })} />);
    expect(screen.getByTestId("search-error")).toHaveTextContent("Cannot reach the backend");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onExecuteSearch).toHaveBeenCalledWith("csv", "hybrid");
  });

  it("shows the empty state when a search returned nothing", () => {
    render(<SearchView {...searchProps({ results: [] })} />);
    expect(screen.getByTestId("search-empty")).toBeInTheDocument();
  });

  it("renders results with the raw score and both rank badges, and highlights query terms", () => {
    render(<SearchView {...searchProps({ results: [result()] })} />);
    const card = screen.getByTestId("result-card");
    expect(within(card).getByText("Score 0.0328")).toBeInTheDocument();
    expect(within(card).getByText("Keyword #1")).toBeInTheDocument();
    expect(within(card).getByText("Semantic #2")).toBeInTheDocument();
    expect(card.querySelector("mark.hl")?.textContent?.toLowerCase()).toBe("csv");
    expect(card).not.toHaveTextContent("% match");
  });

  it("does not highlight when auto-highlight is off", () => {
    render(
      <SearchView {...searchProps({ results: [result()], settings: { ...DEFAULT_SETTINGS, autoHighlight: false } })} />
    );
    expect(screen.getByTestId("result-card").querySelector("mark")).toBeNull();
  });

  it("filters client-side by kind and reports 'X of Y'", async () => {
    const results = [result(), result({ id: "r2", title: "Report", kind: "document", type: "PDF" })];
    render(<SearchView {...searchProps({ results })} />);
    expect(screen.getAllByTestId("result-card")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getAllByTestId("result-card")).toHaveLength(1);
    expect(screen.getByTestId("result-summary")).toHaveTextContent("1 of 2");
  });

  it("sorts by title when asked", async () => {
    const results = [result({ id: "a", title: "zeta", score: 0.9 }), result({ id: "b", title: "alpha", score: 0.1 })];
    render(<SearchView {...searchProps({ results })} />);
    const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles()[0]).toContain("zeta"); // by score
    await userEvent.click(screen.getByRole("button", { name: "Filters & Sort" }));
    await userEvent.click(screen.getByRole("button", { name: "Title (A–Z)" }));
    expect(titles()[0]).toContain("alpha");
  });

  it("offers no 'Most Recent' sort, because results carry no timestamp", async () => {
    render(<SearchView {...searchProps({ results: [result()] })} />);
    await userEvent.click(screen.getByRole("button", { name: "Filters & Sort" }));
    expect(screen.queryByText(/Most Recent/)).toBeNull();
  });

  it("exposes mode and filter toggles with aria-pressed", () => {
    render(<SearchView {...searchProps()} />);
    expect(screen.getByRole("button", { name: /Hybrid RRF/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Keyword Only/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("starts the selected mode from Settings and passes it to the search", async () => {
    const onExecuteSearch = vi.fn();
    render(
      <SearchView
        {...searchProps({ onExecuteSearch, settings: { ...DEFAULT_SETTINGS, defaultSearchMode: "lexical" } })}
      />
    );
    expect(screen.getByRole("button", { name: /Keyword Only/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onExecuteSearch).toHaveBeenCalledWith("csv", "lexical");
  });

  it("hides the microphone when voice input is disabled in Settings", () => {
    render(<SearchView {...searchProps({ settings: { ...DEFAULT_SETTINGS, enableVoiceInput: false } })} />);
    expect(screen.queryByRole("button", { name: /voice/i })).toBeNull();
  });

  it("reports unsupported speech recognition via a notification, not alert()", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onNotify = vi.fn();
    render(<SearchView {...searchProps({ onNotify })} />);
    await userEvent.click(screen.getByRole("button", { name: "Search by voice" }));
    expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/isn't supported/), "error");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("disables Search for a blank query", () => {
    render(<SearchView {...searchProps({ query: "   " })} />);
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });
});

describe("LibraryView", () => {
  const props = () => ({ onUploadFiles: vi.fn().mockResolvedValue(undefined), onDeleteFile: vi.fn().mockResolvedValue(undefined), onPreviewFile: vi.fn() });

  it("distinguishes 'backend unavailable' from 'no files'", () => {
    const { rerender } = render(<LibraryView files={null} {...props()} />);
    expect(screen.getByText(/File list unavailable/)).toBeInTheDocument();
    rerender(<LibraryView files={[]} {...props()} />);
    expect(screen.getByText(/No files indexed yet/)).toBeInTheDocument();
  });

  it("requires explicit confirmation before deleting", async () => {
    const p = props();
    render(<LibraryView files={[file()]} {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete notes.txt" }));
    expect(p.onDeleteFile).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm deleting notes.txt" }));
    expect(p.onDeleteFile).toHaveBeenCalledWith("f1");
  });

  it("can cancel a pending delete", async () => {
    const p = props();
    render(<LibraryView files={[file()]} {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete notes.txt" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete notes.txt" })).toBeInTheDocument();
    expect(p.onDeleteFile).not.toHaveBeenCalled();
  });

  it("colours non-indexed statuses differently from success", () => {
    render(<LibraryView files={[file({ status: "Error" })]} {...props()} />);
    expect(screen.getByText("Error")).toHaveStyle({ color: "var(--danger)" });
  });

  it("filters by tab and by text", async () => {
    const files = [file(), file({ id: "f2", name: "app.py", kind: "code", type: "PY", path: "/u/app.py" })];
    render(<LibraryView files={files} {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: /Source Code/ }));
    expect(screen.queryByText("notes.txt")).toBeNull();
    expect(screen.getByText("app.py")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /All Items/ }));
    await userEvent.type(screen.getByLabelText("Filter files by name or type"), "notes");
    expect(screen.queryByText("app.py")).toBeNull();
  });

  it("hands chosen files to the upload handler", async () => {
    const p = props();
    render(<LibraryView files={[]} {...p} />);
    const f = new File(["x"], "a.py");
    await userEvent.upload(screen.getByTestId("file-input"), f);
    expect(p.onUploadFiles).toHaveBeenCalledWith([f]);
  });

  it("offers a real, keyboard-operable button as the non-drag upload path", async () => {
    render(<LibraryView files={[]} {...props()} />);
    const click = vi.spyOn(screen.getByTestId("file-input"), "click");
    const btn = screen.getByRole("button", { name: /Upload New Files/ });
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(click).toHaveBeenCalled();
    expect(screen.getByTestId("drop-zone")).not.toHaveAttribute("role");
  });
});

describe("AnalyticsView honesty", () => {
  const metrics = {
    totalDocuments: 1,
    totalCodeFiles: 2,
    totalChunks: 14,
    totalSearches: 0,
    avgLatencyMs: 16.4, // the backend's constant fallback when there is no data
    ftsStatus: "Online" as const,
    faissStatus: "Online" as const,
    embeddingModel: "m",
    precisionAt1: 0.94,
    precisionAt5: 0.88,
    recallAt5: 0.86,
    mrrScore: 0.92,
    modeBreakdown: {},
  };

  it("never displays the backend's constant quality figures or fabricated benchmarks", () => {
    render(<AnalyticsView metrics={metrics} health={null} />);
    expect(screen.queryByText(/94%/)).toBeNull();
    expect(screen.queryByText(/0\.92/)).toBeNull();
    expect(screen.queryByText(/16\.4/)).toBeNull();
    expect(screen.getByTestId("quality-not-measured")).toHaveTextContent("Not measured yet");
  });

  it("shows real counts from the backend", () => {
    render(<AnalyticsView metrics={metrics} health={null} />);
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("says analytics are unavailable rather than showing numbers when the backend gave none", () => {
    render(<AnalyticsView metrics={null} health={null} />);
    expect(screen.getByTestId("analytics-unavailable")).toBeInTheDocument();
  });
});

describe("HistoryView", () => {
  const entry = { id: "h1", query: "csv files", timestamp: "2026-01-01 10:00:00", date: "2026-01-01", mode: "hybrid" as const, resultsCount: 3, latencyMs: 12.5, topResultTitle: "parse_csv" };

  it("separates 'unavailable' from 'empty'", () => {
    const { rerender } = render(<HistoryView history={null} onReRunSearch={vi.fn()} onClearHistory={vi.fn()} onAnalyzeQuery={vi.fn()} />);
    expect(screen.getByTestId("history-empty")).toHaveTextContent("History unavailable");
    rerender(<HistoryView history={[]} onReRunSearch={vi.fn()} onClearHistory={vi.fn()} onAnalyzeQuery={vi.fn()} />);
    expect(screen.getByTestId("history-empty")).toHaveTextContent("No search history yet");
  });

  it("asks for confirmation before clearing and re-runs a query", async () => {
    const onClearHistory = vi.fn();
    const onReRunSearch = vi.fn();
    render(<HistoryView history={[entry]} onReRunSearch={onReRunSearch} onClearHistory={onClearHistory} onAnalyzeQuery={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Re-run Search" }));
    expect(onReRunSearch).toHaveBeenCalledWith("csv files");
    await userEvent.click(screen.getByRole("button", { name: "Clear History" }));
    expect(onClearHistory).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yes, clear" }));
    expect(onClearHistory).toHaveBeenCalledTimes(1);
  });

  it("filters history text", async () => {
    render(<HistoryView history={[entry, { ...entry, id: "h2", query: "java auth" }]} onReRunSearch={vi.fn()} onClearHistory={vi.fn()} onAnalyzeQuery={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Filter search history"), "java");
    expect(screen.queryByText(/csv files/)).toBeNull();
    expect(screen.getByText(/java auth/)).toBeInTheDocument();
  });
});
