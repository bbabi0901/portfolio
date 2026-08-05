import { describe, it, expect } from "vitest";

import { retrieve } from "@/lib/retriever";
import { fixtureEmbedding } from "@/lib/embeddings";
import type { PortfolioChunk, PortfolioServerData } from "@/types/portfolio";

const mkChunk = (
  id: string,
  text: string,
  headingPath: string[] = [],
  tags: string[] = [],
  tokens = 100,
): PortfolioChunk => ({
  id,
  sourcePageId: "p1",
  sourceTitle: "Sample",
  sourceUrl: "https://www.notion.so/p1",
  category: "project",
  headingPath,
  text,
  tokens,
  embedding: fixtureEmbedding(text, 1536),
  tags,
});

const mkData = (chunks: PortfolioChunk[]): PortfolioServerData => ({
  version: "0.1.0",
  generatedAt: "2026-05-06T12:00:00+09:00",
  chunks,
  suggestedQuestions: [],
  profile: { name: "김윤수", oneLiner: "", contact: { email: "" } },
});

describe("retrieve", () => {
  it("returns top-K matching chunks (hybrid mode)", () => {
    const data = mkData([
      mkChunk("c1", "Module Federation 마이그레이션 작업", ["MFE TF"], ["Module Federation"]),
      mkChunk("c2", "전혀 무관한 토픽 내용입니다"),
    ]);
    const out = retrieve("Module Federation 어떻게?", data, {
      queryEmbedding: fixtureEmbedding("Module Federation 어떻게?", 1536),
      topK: 2,
    });
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0]!.chunk.id).toBe("c1");
    expect(out.results[0]!.scores.keyword).toBeGreaterThan(0);
    expect(out.empty).toBe(false);
    expect(out.mode).toBe("hybrid");
  });

  it("keyword-only mode when no embedding", () => {
    const data = mkData([mkChunk("c1", "Next.js Turbopack 도입 후기")]);
    const out = retrieve("Turbopack 어땠어요", data);
    expect(out.mode).toBe("keyword-only");
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0]!.chunk.id).toBe("c1");
    expect(out.results[0]!.scores.vector).toBe(0);
  });

  it("respects topK", () => {
    const chunks = Array.from({ length: 20 }, (_, i) => mkChunk(`c${i}`, `text body ${i}`));
    const data = mkData(chunks);
    const out = retrieve("text", data, { topK: 5 });
    expect(out.results.length).toBeLessThanOrEqual(5);
  });

  it("respects maxTokens cap (sorted-by-score before cut)", () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      mkChunk(`c${i}`, "common term shared", [], [], 1000),
    );
    const data = mkData(chunks);
    const out = retrieve("common", data, { topK: 20, maxTokens: 3500 });
    const total = out.results.reduce((s, r) => s + r.chunk.tokens, 0);
    expect(total).toBeLessThanOrEqual(3500);
    expect(out.results.length).toBeLessThanOrEqual(4);
  });

  it("returns empty when below minVectorScore and no keyword match", () => {
    const data = mkData([mkChunk("c1", "전혀 다른 토픽")]);
    const out = retrieve("zzzqqq", data, {
      queryEmbedding: fixtureEmbedding("zzzqqq", 1536),
      minVectorScore: 0.99,
    });
    expect(out.empty).toBe(true);
    expect(out.results).toEqual([]);
  });

  it("throws on dimension mismatch", () => {
    const chunkBad: PortfolioChunk = { ...mkChunk("c1", "x"), embedding: [1, 0] };
    const data = mkData([chunkBad]);
    expect(() => retrieve("x", data, { queryEmbedding: fixtureEmbedding("x", 1536) })).toThrow();
  });

  it("handles empty data", () => {
    const out = retrieve("anything", mkData([]));
    expect(out.empty).toBe(true);
    expect(out.results).toEqual([]);
  });

  it("handles empty query", () => {
    const data = mkData([mkChunk("c1", "x")]);
    const out = retrieve("", data);
    expect(out.empty).toBe(true);
    expect(out.results).toEqual([]);
  });

  it("merges keyword and vector with default 0.4/0.6 weights", () => {
    const data = mkData([
      mkChunk("kw", "Module Federation Module Federation"),
      mkChunk("vec", "전혀 다른 텍스트 내용"),
    ]);
    const out = retrieve("Module Federation", data, {
      queryEmbedding: fixtureEmbedding("Module Federation", 1536),
      topK: 2,
    });
    const kw = out.results.find((r) => r.chunk.id === "kw");
    expect(kw).toBeDefined();
    expect(kw!.scores.merged).toBeCloseTo(
      0.4 * kw!.scores.keyword + 0.6 * Math.max(0, kw!.scores.vector),
      5,
    );
  });

  it("matches against tags and headingPath, not just text", () => {
    const data = mkData([
      mkChunk("c1", "본문 내용은 무관함", ["Module Federation"], []),
      mkChunk("c2", "또 다른 본문", [], ["Turbopack"]),
    ]);
    const out = retrieve("Module Federation", data);
    expect(out.results[0]!.chunk.id).toBe("c1");
  });

  it("is deterministic", () => {
    const data = mkData([mkChunk("c1", "Module Federation"), mkChunk("c2", "Turbopack")]);
    const a = retrieve("Module Federation", data, {
      queryEmbedding: fixtureEmbedding("Module Federation", 1536),
    });
    const b = retrieve("Module Federation", data, {
      queryEmbedding: fixtureEmbedding("Module Federation", 1536),
    });
    expect(a).toEqual(b);
  });

  // TS-91: 외부 벡터 점수 주입 (S3 Vectors) — ADR-034 Phase 3
  describe("vectorScores 주입", () => {
    const data = mkData([
      mkChunk("c1", "마이크로 프론트엔드 Module Federation 도입", ["아키텍처"]),
      mkChunk("c2", "웹 푸시 알림 구현", ["알림"]),
      mkChunk("c3", "완전히 무관한 취미 이야기", ["취미"]),
    ]);

    it("vectorScores 존재 시 mode=hybrid + 점수 병합(0.4/0.6)", () => {
      const scores = new Map([["c1", 0.9]]);
      const r = retrieve("마이크로 프론트엔드", data, { vectorScores: scores });
      expect(r.mode).toBe("hybrid");
      const hit = r.results.find((x) => x.chunk.id === "c1");
      expect(hit).toBeDefined();
      expect(hit!.scores.vector).toBeCloseTo(0.9);
      expect(hit!.scores.merged).toBeCloseTo(0.4 * hit!.scores.keyword + 0.6 * 0.9, 5);
    });

    it("keyword 0 이어도 vector >= 0.3 이면 통과 (minVectorScore 계약 유지)", () => {
      const scores = new Map([["c3", 0.5]]);
      const r = retrieve("zzz없는키워드zzz", data, { vectorScores: scores });
      expect(r.results.map((x) => x.chunk.id)).toContain("c3");
      expect(r.mode).toBe("hybrid");
    });

    it("맵에 없는 청크의 vector 점수는 0 (keyword 만으로 경쟁)", () => {
      const scores = new Map([["nonexistent-id", 0.99]]);
      const r = retrieve("웹 푸시 알림", data, { vectorScores: scores });
      for (const x of r.results) expect(x.scores.vector).toBe(0);
    });
  });
});
