/**
 * Scheduler utility for yielding execution back to the browser main thread.
 * Ensures immediate frame paints (<16ms) to eliminate Interaction to Next Paint (INP) violations.
 */

export async function yieldToMain(): Promise<void> {
  if (typeof window === "undefined") return;

  // Use the native Prioritized Task Scheduling API (scheduler.yield) if available in Chromium
  if (
    "scheduler" in window &&
    typeof (window as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler?.yield === "function"
  ) {
    try {
      await (window as unknown as { scheduler: { yield: () => Promise<void> } }).scheduler.yield();
      return;
    } catch {
      // Fallback if rejected
    }
  }

  // Fallback: requestAnimationFrame combined with setTimeout(0) to ensure a paint occurs
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
