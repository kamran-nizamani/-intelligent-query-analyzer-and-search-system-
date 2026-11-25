/**
 * Client-side embedding generation (384-D, L2-normalised MiniLM vectors).
 *
 * Inference runs in a dedicated Web Worker so the UI thread stays responsive
 * (INP). If a Worker cannot be created, it falls back to running on the main
 * thread, yielding between texts. A failed load is never cached.
 */

import { yieldToMain } from "../scheduler";
import { createEmbedderCore, type EmbedderCore } from "./embedder-core";
import {
  EMBEDDING_DIM,
  type EmbeddingProgress,
  type WorkerRequest,
  type WorkerResponse,
} from "./embedder-protocol";

export type { EmbeddingProgress } from "./embedder-protocol";

interface Pending {
  onProgress?: (p: EmbeddingProgress) => void;
  onVector?: (index: number, vector: Float32Array) => void;
  resolve: () => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextId = 1;
const pending = new Map<number, Pending>();
let fallbackCore: EmbedderCore | null = null;

function failAll(err: Error) {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerUnavailable || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL("./embedder.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") p.onProgress?.(msg.progress);
      else if (msg.type === "vector") p.onVector?.(msg.index, msg.vector);
      else if (msg.type === "warmed" || msg.type === "done") {
        pending.delete(msg.id);
        p.resolve();
      } else if (msg.type === "error") {
        pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    };
    w.onerror = () => {
      // Worker failed to start or crashed: drop it and use the main-thread fallback from now on.
      w.terminate();
      if (worker === w) worker = null;
      workerUnavailable = true;
      failAll(new WorkerCrashed());
    };
    worker = w;
    return w;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

class WorkerCrashed extends Error {
  constructor() {
    super("Embedding worker crashed");
  }
}

function request(
  body: { type: "warm" } | { type: "embed"; texts: string[] },
  handlers: Pick<Pending, "onProgress" | "onVector">
): Promise<void> | null {
  const w = getWorker();
  if (!w) return null;
  return new Promise<void>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { ...handlers, resolve, reject });
    w.postMessage({ ...body, id } as WorkerRequest);
  });
}

function getFallback(): EmbedderCore {
  if (!fallbackCore) fallbackCore = createEmbedderCore(yieldToMain);
  return fallbackCore;
}

/** Load the model without embedding anything (safe to call repeatedly). */
export async function warmUpEmbedder(onProgress?: (p: EmbeddingProgress) => void): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Web embedder is designed to run in browser environments.");
  }
  const viaWorker = request({ type: "warm" }, { onProgress });
  if (viaWorker) {
    try {
      return await viaWorker;
    } catch (err) {
      if (!(err instanceof WorkerCrashed)) throw err;
    }
  }
  await getFallback().load(onProgress);
}

async function embedMany(
  texts: string[],
  onProgress?: (p: EmbeddingProgress) => void,
  onEach?: (done: number, total: number) => void
): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  const viaWorker = request(
    { type: "embed", texts },
    {
      onProgress,
      onVector: (index, vector) => {
        out[index] = Array.from(vector);
        onEach?.(index + 1, texts.length);
      },
    }
  );
  if (viaWorker) {
    try {
      await viaWorker;
      return out;
    } catch (err) {
      if (!(err instanceof WorkerCrashed)) throw err;
    }
  }

  const core = getFallback();
  await core.load(onProgress);
  for (let i = 0; i < texts.length; i++) {
    await yieldToMain();
    out[i] = Array.from(await core.embed(texts[i]));
    onEach?.(i + 1, texts.length);
  }
  return out;
}

/** Embed a single string. Output is L2-normalised (norm = 1.0). */
export async function embedText(
  text: string,
  onProgress?: (p: EmbeddingProgress) => void
): Promise<number[]> {
  if (!text.trim()) return new Array(EMBEDDING_DIM).fill(0);
  const [vec] = await embedMany([text], onProgress);
  return vec;
}

/** Embed many strings sequentially (in the worker). */
export async function embedBatch(
  texts: string[],
  onProgress?: (index: number, total: number) => void
): Promise<number[][]> {
  if (texts.length === 0) return [];
  return embedMany(texts, undefined, onProgress);
}

/** @internal test hook */
export function __resetEmbedderForTests() {
  worker?.terminate();
  worker = null;
  workerUnavailable = false;
  pending.clear();
  fallbackCore = null;
  nextId = 1;
}
