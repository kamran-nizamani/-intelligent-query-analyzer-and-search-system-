/**
 * Client-side embedding generation using the official Hugging Face Transformers.js v4 runtime.
 * Generates 384-dimensional normalized float vectors for query and chunk embeddings.
 */

import { yieldToMain } from "../scheduler";

export interface EmbeddingProgress {
  status: "init" | "downloading" | "ready" | "processing";
  progress?: number;
  file?: string;
}

export type FeatureExtractor = (
  text: string | string[],
  options?: { pooling: "mean" | "cls"; normalize: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractorInstance: FeatureExtractor | null = null;
let extractorPromise: Promise<FeatureExtractor> | null = null;

export async function getWebEmbedder(
  onProgress?: (p: EmbeddingProgress) => void
): Promise<FeatureExtractor> {
  if (extractorInstance) {
    return extractorInstance;
  }

  if (!extractorPromise) {
    const initialization = (async () => {
      if (typeof window === "undefined") {
        throw new Error("Web embedder is designed to run in browser environments.");
      }

      onProgress?.({ status: "init" });
      await yieldToMain();

      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.useBrowserCache = true;
      env.useWasmCache = true;

      const progress_callback = (item: { status?: string; progress?: number; file?: string }) => {
        if (
          (item?.status === "progress" || item?.status === "progress_total") &&
          item.progress !== undefined
        ) {
          onProgress?.({
            status: "downloading",
            progress: Math.round(item.progress),
            file: item.file,
          });
        }
      };

      // Prefer WebGPU when available; fall back to the default WASM runtime if
      // the browser exposes WebGPU but the device/driver cannot initialize it.
      let pipe;
      if ("gpu" in navigator) {
        try {
          pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
            device: "webgpu",
            progress_callback,
          });
        } catch {
          pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
            progress_callback,
          });
        }
      } else {
        pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          progress_callback,
        });
      }

      onProgress?.({ status: "ready" });
      await yieldToMain();
      extractorInstance = pipe as unknown as FeatureExtractor;
      return extractorInstance;
    })();
    extractorPromise = initialization.catch((error) => {
      // Permit retry after transient model download or initialization failures.
      extractorPromise = null;
      throw error;
    });
  }

  return extractorPromise;
}

/**
 * Generate 384-dimensional dense vector for a single text string.
 * Output is L2-normalized (norm = 1.0).
 */
export async function embedText(
  text: string,
  onProgress?: (p: EmbeddingProgress) => void
): Promise<number[]> {
  await yieldToMain();
  const extractor = await getWebEmbedder(onProgress);
  const clean = text.trim();
  if (!clean) {
    return new Array(384).fill(0);
  }

  await yieldToMain();
  const output = await extractor(clean, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * Generate 384-dimensional embeddings for a batch of texts sequentially.
 */
export async function embedBatchWithExtractor(
  extractor: FeatureExtractor,
  texts: string[],
  onProgress?: (index: number, total: number) => void
): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  const batchSize = 4;
  const dimension = 384;

  for (let start = 0; start < texts.length; start += batchSize) {
    const end = Math.min(start + batchSize, texts.length);
    const nonEmpty: Array<{ index: number; text: string }> = [];

    for (let index = start; index < end; index += 1) {
      const text = texts[index].trim();
      if (!text) results[index] = new Array(dimension).fill(0);
      else nonEmpty.push({ index, text });
    }

    if (nonEmpty.length > 0) {
      await yieldToMain();

      try {
        // Transformers.js accepts an array and returns [batch, 384] pooled vectors.
        const output = await extractor(
          nonEmpty.map((item) => item.text),
          { pooling: "mean", normalize: true }
        );
        if (output.data.length !== nonEmpty.length * dimension) {
          throw new Error("Unexpected batch embedding dimensions.");
        }

        nonEmpty.forEach(({ index }, batchIndex) => {
          const offset = batchIndex * dimension;
          results[index] = Array.from(output.data.slice(offset, offset + dimension));
        });
      } catch (batchError) {
        // Smaller devices may run out of memory on a batch. Fall back to singles.
        if (nonEmpty.length === 1) throw batchError;
        for (const item of nonEmpty) {
          await yieldToMain();
          const output = await extractor(item.text, { pooling: "mean", normalize: true });
          if (output.data.length !== dimension) {
            throw new Error("Embedding model returned an invalid vector dimension.");
          }
          results[item.index] = Array.from(output.data);
        }
      }
    }

    onProgress?.(end, texts.length);
  }

  return results;
}

export async function embedBatch(
  texts: string[],
  onProgress?: (index: number, total: number) => void
): Promise<number[][]> {
  const extractor = await getWebEmbedder();
  return embedBatchWithExtractor(extractor, texts, onProgress);
}
