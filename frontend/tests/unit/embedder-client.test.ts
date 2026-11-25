import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetEmbedderForTests, embedBatch, embedText, warmUpEmbedder } from "@/lib/embeddings/web-embedder";

type Handler = (e: { data: unknown }) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  static mode: "ok" | "error-msg" | "crash" = "ok";
  onmessage: Handler | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(req: { id: number; type: string; texts?: string[] }) {
    queueMicrotask(() => {
      if (FakeWorker.mode === "crash") return this.onerror?.();
      if (FakeWorker.mode === "error-msg") return this.onmessage?.({ data: { id: req.id, type: "error", message: "model failed" } });
      if (req.type === "warm") return this.onmessage?.({ data: { id: req.id, type: "warmed" } });
      req.texts!.forEach((_, i) => this.onmessage?.({ data: { id: req.id, type: "vector", index: i, vector: new Float32Array([i, 1]) } }));
      this.onmessage?.({ data: { id: req.id, type: "done" } });
    });
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.mode = "ok";
  __resetEmbedderForTests();
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe("web embedder client (worker)", () => {
  it("returns a zero vector for blank text without spawning a worker", async () => {
    const v = await embedText("   ");
    expect(v).toHaveLength(384);
    expect(v.every((x) => x === 0)).toBe(true);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("embeds a batch in order through one worker and reports progress", async () => {
    const seen: number[] = [];
    const out = await embedBatch(["a", "b", "c"], (i) => seen.push(i));
    expect(out).toEqual([[0, 1], [1, 1], [2, 1]]);
    expect(seen.sort()).toEqual([1, 2, 3]);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("embedText resolves a single vector", async () => {
    expect(await embedText("hello")).toEqual([0, 1]);
  });

  it("warm-up resolves via the worker", async () => {
    await expect(warmUpEmbedder()).resolves.toBeUndefined();
  });

  it("surfaces worker errors and allows a later retry (failure is not cached)", async () => {
    FakeWorker.mode = "error-msg";
    await expect(embedText("hello")).rejects.toThrow("model failed");
    FakeWorker.mode = "ok";
    expect(await embedText("hello")).toEqual([0, 1]);
  });
});
