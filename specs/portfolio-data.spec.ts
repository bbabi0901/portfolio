import { describe, it, expect, beforeEach } from "vitest";

import {
  loadPortfolio,
  clearPortfolioCache,
  toClientData,
} from "@/lib/portfolio-data";

describe("portfolio-data loader", () => {
  beforeEach(() => clearPortfolioCache());

  it("loads from data/portfolio.server.json or fallback data/portfolio.sample.json", () => {
    const data = loadPortfolio();
    expect(data.chunks.length).toBeGreaterThan(0);
    expect(data.suggestedQuestions).toBeDefined();
    expect(data.profile).toBeDefined();
    expect(data.version).toBeDefined();
    expect(data.generatedAt).toBeDefined();
  });

  it("toClientData strips embeddings and chunks", () => {
    const server = loadPortfolio();
    const client = toClientData(server);
    expect("chunks" in client).toBe(false);
    expect(client.suggestedQuestions).toBeDefined();
    expect(client.profile).toBeDefined();
    expect(client.version).toBe(server.version);
    expect(client.generatedAt).toBe(server.generatedAt);
  });

  it("caches across calls (same reference)", () => {
    const a = loadPortfolio();
    const b = loadPortfolio();
    expect(a).toBe(b);
  });

  it("clearCache invalidates", () => {
    const a = loadPortfolio();
    clearPortfolioCache();
    const b = loadPortfolio();
    expect(a).not.toBe(b);
    expect(b.chunks.length).toBe(a.chunks.length);
  });

  it("loaded chunks have valid structure", () => {
    const data = loadPortfolio();
    for (const chunk of data.chunks) {
      expect(chunk.id).toBeTypeOf("string");
      expect(chunk.sourcePageId).toBeTypeOf("string");
      expect(chunk.sourceTitle).toBeTypeOf("string");
      expect(chunk.sourceUrl).toBeTypeOf("string");
      expect(chunk.text).toBeTypeOf("string");
      expect(chunk.tokens).toBeTypeOf("number");
      expect(Array.isArray(chunk.headingPath)).toBe(true);
      expect(Array.isArray(chunk.embedding)).toBe(true);
      expect(chunk.embedding.length).toBeGreaterThan(0);
    }
  });
});
