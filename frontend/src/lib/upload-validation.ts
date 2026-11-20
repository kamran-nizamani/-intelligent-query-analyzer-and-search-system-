export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".py", ".java", ".js", ".jsx"] as const;

export type UploadValidation = { valid: File[]; rejected: Array<{ name: string; reason: string }> };

/**
 * Client-side pre-check so users get immediate, specific feedback. The server
 * remains the source of truth; it re-validates the extension.
 */
export function validateUploads(files: File[]): UploadValidation {
  const valid: File[] = [];
  const rejected: UploadValidation["rejected"] = [];

  for (const file of files) {
    const dot = file.name.lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      rejected.push({ name: file.name, reason: "unsupported file type" });
    } else if (file.size === 0) {
      rejected.push({ name: file.name, reason: "file is empty" });
    } else if (file.size > MAX_UPLOAD_BYTES) {
      rejected.push({ name: file.name, reason: "larger than 20 MB" });
    } else {
      valid.push(file);
    }
  }
  return { valid, rejected };
}
