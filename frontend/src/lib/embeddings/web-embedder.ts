/**
 * Client-side embedding generation using Transformers.js (@xenova/transformers).
 * Generates 384-dimensional normalized float vectors for query and chunk embeddings.
 */

export interface EmbeddingProgress {
  status: "init" | "downloading" | "ready" | "processing";
  progress?: number;
  file?: string;
}

type FeatureExtractor = (
  text: string,
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
    extractorPromise = (async () => {
      if (typeof window === "undefined") {
        throw new Error("Web embedder is designed to run in browser environments.");
      }

      onProgress?.({ status: "init" });

      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        quantized: true,
        progress_callback: (item: { status?: string; progress?: number; file?: string }) => {
          if (item?.status === "progress" && item.progress !== undefined) {
            onProgress?.({
              status: "downloading",
              progress: Math.round(item.progress),
              file: item.file,
            });
          }
        },
      });

      onProgress?.({ status: "ready" });
      extractorInstance = pipe as unknown as FeatureExtractor;
      return extractorInstance;
    })();
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
  const extractor = await getWebEmbedder(onProgress);
  const clean = text.trim();
  if (!clean) {
    return new Array(384).fill(0);
  }

  const output = await extractor(clean, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * Generate 384-dimensional embeddings for a batch of texts sequentially.
 */
export async function embedBatch(
  texts: string[],
  onProgress?: (index: number, total: number) => void
): Promise<number[][]> {
  const extractor = await getWebEmbedder();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i].trim();
    if (!text) {
      results.push(new Array(384).fill(0));
    } else {
      const output = await extractor(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data));
    }
    onProgress?.(i + 1, texts.length);
  }

  return results;
}
