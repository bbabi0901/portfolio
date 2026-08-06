import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

import {
  loadPortfolio,
  loadPortfolioFrom,
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
      // 슬림 폴백(fallback.json)은 임베딩 미보유 — 빈 배열 허용 (TS-93, ADR-038)
      expect(Array.isArray(chunk.embedding)).toBe(true);
    }
  });
});

// TS-93 — 슬림 폴백 전환 (FEAT-040): 임베딩 없는 커밋 데이터 + 로딩 우선순위
describe("portfolio-data slim fallback (TS-93)", () => {
  const base = {
    version: "1.0.0",
    generatedAt: "2026-08-06T00:00:00+09:00",
    suggestedQuestions: [],
    profile: { name: "김윤수", oneLiner: "x", contact: { email: "e@e.com" } },
  };
  const chunk = (id: string, embedding?: number[]) => ({
    id,
    sourcePageId: "p1",
    sourceTitle: "t",
    sourceUrl: "https://notion.so/x",
    category: "project",
    headingPath: [],
    text: `본문 ${id}`,
    tokens: 3,
    ...(embedding ? { embedding } : {}),
  });
  const write = (dir: string, name: string, chunks: unknown[]) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify({ ...base, chunks }), "utf8");
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pf-data-"));

  it("fallback.json 만 있으면 그걸 로드하고 embedding=[] 로 채운다", () => {
    const dir = tmp();
    write(dir, "portfolio.fallback.json", [chunk("a")]);
    const d = loadPortfolioFrom(dir);
    expect(d.chunks).toHaveLength(1);
    expect(d.chunks[0]!.embedding).toEqual([]);
  });

  it("우선순위 — server.json > fallback.json > sample.json", () => {
    const dir = tmp();
    write(dir, "portfolio.server.json", [chunk("from-server", [0.1, 0.2])]);
    write(dir, "portfolio.fallback.json", [chunk("from-fallback")]);
    write(dir, "portfolio.sample.json", [chunk("from-sample", [0.3])]);
    expect(loadPortfolioFrom(dir).chunks[0]!.id).toBe("from-server");
    fs.rmSync(path.join(dir, "portfolio.server.json"));
    expect(loadPortfolioFrom(dir).chunks[0]!.id).toBe("from-fallback");
    fs.rmSync(path.join(dir, "portfolio.fallback.json"));
    expect(loadPortfolioFrom(dir).chunks[0]!.id).toBe("from-sample");
  });

  it("세 파일 모두 없으면 안내 에러", () => {
    expect(() => loadPortfolioFrom(tmp())).toThrow(/sync:notion/);
  });
});
