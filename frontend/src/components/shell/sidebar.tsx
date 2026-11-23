"use client";

import React from "react";
import {
  Activity,
  Binary,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  History,
  LayoutDashboard,
  LucideIcon,
  Search,
  Settings,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

export type NavItem =
  | "overview"
  | "search"
  | "analyzer"
  | "pipeline"
  | "library"
  | "history"
  | "analytics"
  | "settings";

interface SidebarProps {
  currentView: NavItem;
  onSelectView: (view: NavItem) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** Number of indexed files, or null when Supabase has not answered. */
  totalFiles: number | null;
  backendStatus: "checking" | "online" | "offline";
}

const STATUS_LABEL = {
  checking: "Connecting…",
  online: "Supabase connected",
  offline: "Supabase offline",
} as const;

export function Sidebar({
  currentView,
  onSelectView,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  totalFiles,
  backendStatus,
}: SidebarProps) {
  const navItems: Array<{
    id: NavItem;
    label: string;
    icon: LucideIcon;
    badge?: string;
  }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "search", label: "Intelligent Search", icon: Search, badge: "Hybrid" },
    { id: "analyzer", label: "Query Analyzer", icon: Terminal, badge: "AST" },
    { id: "pipeline", label: "Compiler Pipeline", icon: GitBranch, badge: "7-Stage" },
    {
      id: "library",
      label: "Document Library",
      icon: BookOpen,
      badge: totalFiles === null ? "–" : `${totalFiles}`,
    },
    { id: "history", label: "Search History", icon: History },
    { id: "analytics", label: "Analytics", icon: Activity },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  // The mobile drawer is always "expanded" regardless of the desktop collapse state.
  const compact = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div onClick={onCloseMobile} className="sidebar-scrim" aria-hidden="true" />}

      <aside
        id="app-sidebar"
        aria-label="Primary"
        className={`sidebar ${compact ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}
      >
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-badge" aria-hidden="true">
              <Binary size={19} />
            </div>
            {!compact && (
              <div className="logo-text-wrap">
                <span className="logo-title">Query Analyzer</span>
                <span className="logo-subtitle">Compiler & Hybrid Search</span>
              </div>
            )}
          </div>

          {mobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="btn-icon"
              aria-label="Close navigation menu"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {!compact && <div className="nav-section-title">Core Navigation</div>}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  if (mobileOpen) onCloseMobile();
                }}
                className={`nav-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                aria-label={compact ? item.label : undefined}
                title={compact ? item.label : undefined}
              >
                <Icon size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
                {!compact && (
                  <>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.label}
                    </span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {!compact && (
            <div className="engine-status-card" data-testid="engine-status" data-status={backendStatus}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className={`status-dot status-${backendStatus}`} aria-hidden="true" />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-main)" }}>
                    {STATUS_LABEL[backendStatus]}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Postgres FTS + pgvector + MiniLM</span>
                </div>
              </div>
              <Sparkles size={14} aria-hidden="true" style={{ color: "var(--accent-text)" }} />
            </div>
          )}

          {/* Desktop-only collapse control (the drawer on small screens has a close button instead) */}
          <div
            className="sidebar-collapse-row"
            style={{
              justifyContent: compact ? "center" : "space-between",
              padding: compact ? "6px 0" : "4px 2px",
            }}
          >
            {!compact && (
              <span style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                Compiler IR · RRF
              </span>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="btn-icon"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{ width: 28, height: 28 }}
            >
              {collapsed ? (
                <ChevronRight size={14} aria-hidden="true" />
              ) : (
                <ChevronLeft size={14} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
