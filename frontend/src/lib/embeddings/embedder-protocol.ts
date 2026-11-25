/** Messages exchanged between the main thread and the embedding worker. */

export interface EmbeddingProgress {
  status: "init" | "downloading" | "ready" | "processing";
  progress?: number;
  file?: string;
}

export const EMBEDDING_DIM = 384;

export type WorkerRequest =
  | { id: number; type: "warm" }
  | { id: number; type: "embed"; texts: string[] };

export type WorkerResponse =
  | { id: number; type: "progress"; progress: EmbeddingProgress }
  | { id: number; type: "warmed" }
  | { id: number; type: "vector"; index: number; vector: Float32Array }
  | { id: number; type: "done" }
  | { id: number; type: "error"; message: string };
