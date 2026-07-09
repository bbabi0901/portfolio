import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  embeddingCacheKey,
  loadEmbeddingsCache,
  saveEmbeddingsCache,
} from "@/lib/embeddings-cache";

describe("embeddings-cache", () => {
  it("key is deterministic for same namespace + text", () => {
    expect(embeddingCacheKey("voyage-3-lite@512", "hello")).toBe(
      embeddingCacheKey("voyage-3-lite@512", "hello"),
    );
  });

  it("key differs by namespace (provider/model/dim → 다른 벡터 공간)", () => {
    expect(embeddingCacheKey("voyage-3-lite@512", "x")).not.toBe(
      embeddingCacheKey("text-embedding-3-small@1536", "x"),
    );
  });

  it("key differs by text", () => {
    expect(embeddingCacheKey("m", "a")).not.toBe(embeddingCacheKey("m", "b"));
  });

  it("load → 없는 파일이면 빈 캐시", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "embcache-"));
    expect(loadEmbeddingsCache(path.join(dir, "missing.json"))).toEqual({});
  });

  it("save 후 load 라운드트립", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "embcache-"));
    const file = path.join(dir, "c.json");
    const cache = { k1: [0.1, 0.2, 0.3], k2: [0.4] };
    saveEmbeddingsCache(file, cache);
    expect(loadEmbeddingsCache(file)).toEqual(cache);
  });
});
