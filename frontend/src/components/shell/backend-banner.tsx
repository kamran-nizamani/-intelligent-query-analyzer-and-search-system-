"use client";

import React from "react";
import { PlugZap, RefreshCw } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface BackendBannerProps {
  onRetry: () => void;
}

/** Shown whenever the API server cannot be reached, so empty screens are never mistaken for "no data". */
export function BackendBanner({ onRetry }: BackendBannerProps) {
  return (
    <div role="alert" className="backend-banner" data-testid="backend-banner">
      <PlugZap size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>Backend unreachable.</strong>{" "}
        <span>
          Search, uploads, history and analytics need the API server at{" "}
          <code>{API_BASE}</code>. Nothing shown below is real data until it reconnects.
        </span>
      </div>
      <button type="button" className="btn-secondary" onClick={onRetry} style={{ fontSize: 12 }}>
        <RefreshCw size={13} aria-hidden="true" />
        <span>Retry</span>
      </button>
    </div>
  );
}
