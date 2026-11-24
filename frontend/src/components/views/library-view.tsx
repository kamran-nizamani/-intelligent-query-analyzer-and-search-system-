"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Eye,
  FileCode2,
  FileText,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import type { IndexedFile } from "@/types/search";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/lib/upload-validation";

interface LibraryViewProps {
  /** `null` when the backend has not provided the file list. */
  files: IndexedFile[] | null;
  onUploadFiles: (files: File[]) => Promise<void>;
  onDeleteFile: (id: string) => Promise<void>;
  onPreviewFile: (file: IndexedFile) => void;
}

export function LibraryView({
  files,
  onUploadFiles,
  onDeleteFile,
  onPreviewFile,
}: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<"all" | "document" | "code">("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const list = files ?? [];

  // Cancel a pending delete confirmation if the file disappears or the user waits.
  useEffect(() => {
    if (!confirmingId) return;
    const t = setTimeout(() => setConfirmingId(null), 6000);
    return () => clearTimeout(t);
  }, [confirmingId]);

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteFile(id);
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setUploading(true);
      try {
        await onUploadFiles(droppedFiles);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      e.target.value = "";
      setUploading(true);
      try {
        await onUploadFiles(selectedFiles);
      } finally {
        setUploading(false);
      }
    }
  };

  const filteredFiles = list.filter((f) => {
    if (activeTab !== "all" && f.kind !== activeTab) return false;
    if (searchFilter.trim()) {
      const term = searchFilter.toLowerCase();
      return (
        f.name.toLowerCase().includes(term) ||
        f.path.toLowerCase().includes(term) ||
        f.type.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const docCount = list.filter((f) => f.kind === "document").length;
  const codeCount = list.filter((f) => f.kind === "code").length;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BookOpen size={22} style={{ color: "var(--accent-text)" }} />
            <h1 className="page-title">Document & Code Library</h1>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary"
            style={{ fontSize: 12 }}
            disabled={uploading}
          >
            <Upload size={14} aria-hidden="true" />
            <span>{uploading ? "Indexing files..." : "Upload New Files"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.join(",")}
            aria-label="Choose files to upload"
            data-testid="file-input"
            tabIndex={-1}
            style={{ display: "none" }}
            onChange={handleFileInputChange}
          />
        </div>
        <p className="page-description">
          Manage indexed knowledge corpus. Supports PDFs, DOCX, TXT notes, and Python, Java, JavaScript AST repositories with chunk-level metadata.
        </p>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        data-testid="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? "var(--accent-primary)" : "var(--border-card)"}`,
          background: isDragging ? "var(--accent-subtle)" : "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          padding: "28px 20px",
          textAlign: "center",
          marginBottom: 24,
          transition: "all 0.2s ease",
          cursor: "pointer",
        }}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--bg-card-hover)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-text)",
            marginBottom: 10,
          }}
        >
          <UploadCloud size={22} aria-hidden="true" />
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
          {uploading ? "Indexing files…" : "Drag and drop files to index them"}
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Supported file extensions: <strong>{ALLOWED_EXTENSIONS.join(", ")}</strong> (max {MAX_UPLOAD_BYTES / 1024 / 1024} MB per file, checked before upload)
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
          {["PDF Document", "Word DOCX", "Plain TXT", "Python (.py)", "Java (.java)", "JavaScript (.js)"].map((badge) => (
            <span
              key={badge}
              style={{
                fontSize: 10.5,
                padding: "2px 8px",
                borderRadius: 4,
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-faint)",
              }}
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {/* Tabs */}
        <div
          role="group"
          aria-label="File category"
          style={{
            display: "flex",
            flexWrap: "wrap",
            background: "var(--bg-card)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-sm)",
            padding: 3,
            gap: 2,
          }}
        >
          {[
            { id: "all", label: "All Items", count: list.length },
            { id: "document", label: "Documents", count: docCount },
            { id: "code", label: "Source Code", count: codeCount },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                padding: "6px 14px",
                borderRadius: 4,
                border: "none",
                background: activeTab === tab.id ? "var(--bg-card-hover)" : "transparent",
                color: activeTab === tab.id ? "var(--text-main)" : "var(--text-muted)",
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 700 : 500,
                cursor: "pointer",
              }}
            >
              <span>{tab.label}</span>{" "}
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Search Input Filter */}
        <div
          className="search-input-box"
          style={{ width: 280, maxWidth: "100%", padding: "7px 12px", boxShadow: "none" }}
        >
          <Search size={14} aria-hidden="true" style={{ color: "var(--text-faint)" }} />
          <input
            type="text"
            aria-label="Filter files by name or type"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter files by name or type..."
            className="search-main-input"
            style={{ fontSize: 12 }}
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter("")}
              className="btn-icon"
              aria-label="Clear filter"
              style={{ width: 24, height: 24 }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Files Table Card */}
      <div className="surface-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }} data-testid="files-table">
            <caption className="sr-only">Indexed files</caption>
            <thead>
              <tr
                style={{
                  background: "var(--bg-card-subtle)",
                  borderBottom: "1px solid var(--border-subtle)",
                  color: "var(--text-faint)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                <th scope="col" style={{ padding: "12px 18px" }}>File Name</th>
                <th scope="col" style={{ padding: "12px 14px" }}>Type</th>
                <th scope="col" style={{ padding: "12px 14px" }}>File Path</th>
                <th scope="col" style={{ padding: "12px 14px" }}>Size</th>
                <th scope="col" style={{ padding: "12px 14px" }}>Chunks</th>
                <th scope="col" style={{ padding: "12px 14px" }}>Status</th>
                <th scope="col" style={{ padding: "12px 14px" }}>Updated</th>
                <th scope="col" style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "36px 18px", textAlign: "center", color: "var(--text-muted)" }}>
                    {files === null
                      ? "File list unavailable: the backend did not respond."
                      : list.length === 0
                        ? "No files indexed yet. Upload PDF, DOCX, TXT, Python, Java or JavaScript files to get started."
                        : "No files match the current filter."}
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => {
                  const isCode = file.kind === "code";
                  const Icon = isCode ? FileCode2 : FileText;

                  return (
                    <tr
                      key={file.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--bg-card-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      {/* Name */}
                      <td style={{ padding: "12px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Icon
                            size={18}
                            style={{ color: isCode ? "#60a5fa" : "#fb7185", flexShrink: 0 }}
                          />
                          <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
                            {file.name}
                          </span>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td style={{ padding: "12px 14px" }}>
                        <span className={`badge badge-${isCode ? "code" : "doc"}-${file.type.toLowerCase()}`}>
                          {file.type}
                        </span>
                      </td>

                      {/* Path */}
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-muted)" }}>
                        {file.path}
                      </td>

                      {/* Size */}
                      <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>
                        {file.size}
                      </td>

                      {/* Chunks */}
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", color: "var(--accent-text)", fontWeight: 600 }}>
                        {file.chunks}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 12,
                            color:
                              file.status === "Indexed"
                                ? "var(--success)"
                                : file.status === "Error"
                                  ? "var(--danger)"
                                  : "var(--warning)",
                          }}
                        >
                          <span
                            className="status-dot"
                            aria-hidden="true"
                            style={{
                              width: 6,
                              height: 6,
                              background: "currentColor",
                              boxShadow: "none",
                            }}
                          />
                          {file.status}
                        </span>
                      </td>

                      {/* Updated */}
                      <td style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: 12 }}>
                        {file.updated}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "12px 18px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => onPreviewFile(file)}
                            className="btn-icon"
                            aria-label={`Preview ${file.name}`}
                            title="Preview file"
                            style={{ width: 32, height: 32 }}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                          {confirmingId === file.id ? (
                            <>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={deletingId === file.id}
                                onClick={() => confirmDelete(file.id)}
                                aria-label={`Confirm deleting ${file.name}`}
                                style={{ fontSize: 11.5, padding: "5px 10px", color: "var(--danger)", borderColor: "var(--danger)" }}
                              >
                                {deletingId === file.id ? "Deleting…" : "Confirm delete"}
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={deletingId === file.id}
                                onClick={() => setConfirmingId(null)}
                                style={{ fontSize: 11.5, padding: "5px 10px" }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingId(file.id)}
                              className="btn-icon"
                              aria-label={`Delete ${file.name}`}
                              title="Delete indexed file"
                              style={{ width: 32, height: 32, color: "var(--danger)" }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
