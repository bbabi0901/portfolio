import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  normalize,
  fixtureEmbedding,
  mergeScores,
} from "@/lib/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 when either is zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("normalize", () => {
  it("preserves direction", () => {
    const n = normalize([3, 4]);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
  });

  it("returns zero vector unchanged", () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("fixtureEmbedding", () => {
  it("is deterministic", () => {
    const a = fixtureEmbedding("hello");
    const b = fixtureEmbedding("hello");
    expect(a).toEqual(b);
  });

  it("differs for different inputs", () => {
    const a = fixtureEmbedding("hello");
    const b = fixtureEmbedding("world");
    expect(cosineSimilarity(a, b)).not.toBeCloseTo(1);
  });

  it("returns unit vector of requested dim", () => {
    const v = fixtureEmbedding("test", 1536);
    expect(v).toHaveLength(1536);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 3);
  });
});

describe("mergeScores", () => {
  it("uses default weights 0.4/0.6", () => {
    expect(mergeScores(1, 1)).toBeCloseTo(1);
    expect(mergeScores(0, 0)).toBeCloseTo(0);
  });

  it("normalizes vector score from [-1,1] to [0,1]", () => {
    expect(mergeScores(0, -1)).toBeCloseTo(0);
    expect(mergeScores(0, 1)).toBeCloseTo(0.6);
  });
});
