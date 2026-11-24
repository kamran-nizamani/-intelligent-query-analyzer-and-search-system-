import React from "react";
import { Info } from "lucide-react";

export type TraceSource = "local";

interface Props {
  source: TraceSource | null;
  error: string | null;
}

export function TraceSourceNotice({ source }: Props) {
  if (source !== "local") return null;
  return (
    <div role="status" data-testid="trace-local-notice" className="backend-banner" style={{ margin: "0 0 20px" }}>
      <Info size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>Browser-based compiler.</strong> Query analysis runs locally in TypeScript; no Python API server is used.
      </div>
    </div>
  );
}
