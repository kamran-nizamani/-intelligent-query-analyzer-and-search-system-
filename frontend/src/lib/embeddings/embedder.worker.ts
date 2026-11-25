/// <reference lib="webworker" />
/**
 * Dedicated worker that owns the ONNX/WASM model so inference never blocks the
 * UI thread (long model init and per-text inference used to freeze interactions
 * for 500ms+).
 */

import { createEmbedderCore } from "./embedder-core";
import type { WorkerRequest, WorkerResponse } from "./embedder-protocol";

const ctx = self as unknown as {
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

const core = createEmbedderCore();

function send(msg: WorkerResponse, transfer?: Transferable[]) {
  ctx.postMessage(msg, transfer);
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === "warm") {
      await core.load((progress) => send({ id: req.id, type: "progress", progress }));
      send({ id: req.id, type: "warmed" });
    } else if (req.type === "embed") {
      await core.load((progress) => send({ id: req.id, type: "progress", progress }));
      for (let i = 0; i < req.texts.length; i++) {
        const vector = await core.embed(req.texts[i]);
        send({ id: req.id, type: "vector", index: i, vector }, [vector.buffer]);
      }
      send({ id: req.id, type: "done" });
    }
  } catch (err) {
    send({ id: req.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
