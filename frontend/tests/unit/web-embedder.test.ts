import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scheduler", () => ({
  yieldToMain: vi.fn().mockResolvedValue(undefined),
}));

import { embedBatchWithExtractor, type FeatureExtractor } from "@/lib/embeddings/web-embedder";

const vector = (value: number) => new Float32Array(384).fill(value);

describe("embedBatchWithExtractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("embeds non-empty inputs in a batch and preserves empty input positions", async () => {
    const extractor = vi.fn<FeatureExtractor>(async (input) => {
      const values = Array.isArray(input) ? input : [input];
      const data = new Float32Array(values.length * 384);
      values.forEach((value, index) => {
        data.set(vector(value === "alpha" ? 1 : 2), index * 384);
      });
      return { data, dims: [values.length, 384] };
    });

    const progress = vi.fn();
    const result = await embedBatchWithExtractor(extractor, ["alpha", "  ", "beta"], progress);

    expect(extractor).toHaveBeenCalledTimes(1);
    expect(extractor).toHaveBeenCalledWith(["alpha", "beta"], {
      pooling: "mean",
      normalize: true,
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(Array(384).fill(1));
    expect(result[1]).toEqual(Array(384).fill(0));
    expect(result[2]).toEqual(Array(384).fill(2));
    expect(progress).toHaveBeenCalledWith(3, 3);
  });

  it("falls back to individual embeddings when a batch exceeds device memory", async () => {
    const extractor = vi.fn<FeatureExtractor>(async (input) => {
      if (Array.isArray(input)) throw new Error("batch allocation failed");
      return {
        data: vector(input === "first" ? 3 : 4),
        dims: [1, 384],
      };
    });

    const result = await embedBatchWithExtractor(extractor, ["first", "second"]);

    expect(extractor).toHaveBeenCalledTimes(3);
    expect(extractor.mock.calls[0][0]).toEqual(["first", "second"]);
    expect(result[0]).toEqual(Array(384).fill(3));
    expect(result[1]).toEqual(Array(384).fill(4));
  });

  it("rejects malformed single-vector dimensions instead of storing invalid embeddings", async () => {
    const extractor = vi.fn<FeatureExtractor>(async () => ({
      data: new Float32Array(12),
      dims: [1, 12],
    }));

    await expect(embedBatchWithExtractor(extractor, ["not-384d"])).rejects.toThrow(
      "Unexpected batch embedding dimensions"
    );
  });
});
