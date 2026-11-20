import React from "react";
import { AlertTriangle } from "lucide-react";

export type TraceSource = "backend" | "local-fallback";

interface Props {
  source: TraceSource | null;
  error: string | null;
}

/**
 * Tells the user where a compiler trace came from. The backend (Python
 * compiler) is authoritative; the TypeScript engine is only an offline
 * approximation and is always labelled as such.
 */
export function TraceSourceNotice({ source, error }: Props) {
  if (source !== "local-fallback") return null;
  return (
    <div role="alert" data-testid="trace-fallback-notice" className="backend-banner" style={{ margin: "0 0 20px" }}>
      <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>Backend compiler unavailable.</strong> This is a local TypeScript approximation of the
        compiler, not the Python implementation, and may differ from real results.
        {error ? <span> ({error})</span> : null}
      </div>
    </div>
  );
}
