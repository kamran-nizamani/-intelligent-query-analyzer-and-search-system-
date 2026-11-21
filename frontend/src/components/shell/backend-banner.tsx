"use client";

import React, { useState } from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import { yieldToMain } from "@/lib/scheduler";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface BackendBannerProps {
  onRetry: () => void | Promise<void>;
}

/** Shown whenever the API server cannot be reached, so empty screens are never mistaken for "no data". */
export function BackendBanner({ onRetry }: BackendBannerProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetryClick = async () => {
    setRetrying(true);
    // Yield to the browser main thread to guarantee the immediate frame paints (<16ms INP)
    await yieldToMain();
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

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
      <button
        type="button"
        className="btn-secondary"
        onClick={handleRetryClick}
        disabled={retrying}
        style={{ fontSize: 12 }}
      >
        <RefreshCw size={13} aria-hidden="true" className={retrying ? "spin-icon" : ""} />
        <span>{retrying ? "Checking…" : "Retry"}</span>
      </button>
    </div>
  );
}
