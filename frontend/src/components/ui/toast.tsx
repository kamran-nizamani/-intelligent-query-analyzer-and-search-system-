"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export type ToastTone = "success" | "error";

interface ToastProps {
  message: string;
  tone?: ToastTone;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, tone = "success", onClose, duration = 4000 }: ToastProps) {
  // Keep the latest onClose without restarting the timer on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!message) return;
    // Errors stay longer so they can be read.
    const timer = setTimeout(() => onCloseRef.current(), tone === "error" ? duration * 2 : duration);
    return () => clearTimeout(timer);
  }, [message, tone, duration]);

  if (!message) return null;

  const isError = tone === "error";
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-testid="toast"
      data-tone={tone}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        left: "auto",
        zIndex: 60,
        background: "var(--bg-card)",
        border: `1px solid ${isError ? "var(--danger)" : "var(--border-active)"}`,
        borderRadius: "var(--radius-md)",
        padding: "12px 18px",
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(380px, calc(100vw - 32px))",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <Icon size={16} style={{ color: isError ? "var(--danger)" : "var(--success)", flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "var(--text-main)", fontWeight: 500, overflowWrap: "anywhere" }}>
        {message}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="btn-icon"
        aria-label="Dismiss notification"
        style={{ width: 24, height: 24, marginLeft: "auto", flexShrink: 0 }}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
