/**
 * Transformers.js feature extraction (Xenova/all-MiniLM-L6-v2, quantized, 384-D,
 * mean-pooled and L2-normalised). Runs inside the embedding worker; also used
 * directly on the main thread as a fallback when Workers are unavailable.
 */

import { EMBEDDING_DIM, type EmbeddingProgress } from "./embedder-protocol";

type FeatureExtractor = (
  text: string,
  options?: { pooling: "mean" | "cls"; normalize: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

export interface EmbedderCore {
  load(onProgress?: (p: EmbeddingProgress) => void): Promise<void>;
  embed(text: string): Promise<Float32Array>;
}

export function createEmbedderCore(yieldFn: () => Promise<void> = async () => {}): EmbedderCore {
  let extractor: FeatureExtractor | null = null;
  let loading: Promise<FeatureExtractor> | null = null;

  async function load(onProgress?: (p: EmbeddingProgress) => void): Promise<void> {
    if (extractor) return;
    if (!loading) {
      loading = (async () => {
        onProgress?.({ status: "init" });
        await yieldFn();
        const { pipeline, env } = await import("@xenova/transformers");
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          quantized: true,
          progress_callback: (item: { status?: string; progress?: number; file?: string }) => {
            if (item?.status === "progress" && item.progress !== undefined) {
              onProgress?.({ status: "downloading", progress: Math.round(item.progress), file: item.file });
            }
          },
        });
        onProgress?.({ status: "ready" });
        extractor = pipe as unknown as FeatureExtractor;
        return extractor;
      })().catch((err) => {
        // Never cache a failed load: the next call must be able to retry.
        loading = null;
        throw err;
      });
    }
    await loading;
  }

  async function embed(text: string): Promise<Float32Array> {
    const clean = text.trim();
    if (!clean) return new Float32Array(EMBEDDING_DIM);
    await load();
    await yieldFn();
    const out = await extractor!(clean, { pooling: "mean", normalize: true });
    return Float32Array.from(out.data);
  }

  return { load, embed };
}
