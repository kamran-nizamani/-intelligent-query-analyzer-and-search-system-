"use client";

import React, { useState } from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import { yieldToMain } from "@/lib/scheduler";

interface BackendBannerProps {
  onRe-check: () => void | Promise<void>;
}

/** Shown when local browser storage is unavailable so empty screens are never mistaken for real empty data. */
export function BackendBanner({ onRetry }: BackendBannerProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetryClick = async () => {
    setRetrying(true);
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
        <strong>Local storage unavailable.</strong>{" "}
        <span>
          Search, uploads, history and analytics need browser IndexedDB. Check browser storage permissions or available disk space. Nothing shown below is real data until local storage is ready.
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
