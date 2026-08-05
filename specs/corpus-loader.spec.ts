import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadRuntimeCorpus, clearCorpusCache } from "@/services/corpus-loader";
import { clearEnvCache } from "@/lib/env";
import { clearPortfolioCache } from "@/lib/portfolio-data";

const ENV_KEYS = ["CORPUS_S3_BUCKET", "CORPUS_S3_KEY"] as const;
const original: Record<string, string | undefined> = {};

const corpusJson = JSON.stringify({
  version: "9.9.9",
  generatedAt: "2026-08-05T12:00:00+09:00",
  chunks: [
    {
      id: "c1",
      sourcePageId: "p1",
      sourceTitle: "제목",
      sourceUrl: "https://notion.so/x",
      category: "project",
      headingPath: [],
      text: "S3 corpus 본문",
      tokens: 5,
    },
  ],
  suggestedQuestions: [],
  profile: { name: "김윤수", oneLiner: "x", contact: { email: "e@e.com" } },
});

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  process.env.CORPUS_S3_BUCKET = "corpus-bucket";
  delete process.env.CORPUS_S3_KEY;
  clearEnvCache();
  clearCorpusCache();
  clearPortfolioCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
  clearCorpusCache();
  vi.restoreAllMocks();
});

// TS-92 — corpus.json S3 런타임 로딩 + 폴백 계약 (FEAT-038, ADR-037)
describe("corpus-loader (TS-92)", () => {
  it("S3 corpus 성공 — 청크 embedding=[] 로 채워 반환, TTL 내 재호출은 fetch 1회", async () => {
    const fetchCorpus = vi.fn().mockResolvedValue(corpusJson);
    const d1 = await loadRuntimeCorpus({ fetchCorpus, now: () => 0 });
    expect(d1.version).toBe("9.9.9");
    expect(d1.chunks[0]!.text).toBe("S3 corpus 본문");
    expect(d1.chunks[0]!.embedding).toEqual([]);
    const d2 = await loadRuntimeCorpus({ fetchCorpus, now: () => 5 * 60 * 1000 });
    expect(d2.version).toBe("9.9.9");
    expect(fetchCorpus).toHaveBeenCalledTimes(1);
  });

  it("TTL(10분) 경과 후 재fetch — 새 corpus 로 교체", async () => {
    const fetchCorpus = vi
      .fn()
      .mockResolvedValueOnce(corpusJson)
      .mockResolvedValueOnce(corpusJson.replace("9.9.9", "10.0.0"));
    await loadRuntimeCorpus({ fetchCorpus, now: () => 0 });
    const d2 = await loadRuntimeCorpus({ fetchCorpus, now: () => 10 * 60 * 1000 + 1 });
    expect(d2.version).toBe("10.0.0");
    expect(fetchCorpus).toHaveBeenCalledTimes(2);
  });

  it("S3 실패 — 커밋 데이터로 폴백 (응답은 계속, embedding 보존)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchCorpus = vi.fn().mockRejectedValue(new Error("boom"));
    const d = await loadRuntimeCorpus({ fetchCorpus, now: () => 0 });
    expect(d.chunks.length).toBeGreaterThan(0);
    expect(d.chunks[0]!.embedding.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
  });

  it("CORPUS_S3_BUCKET 미설정 — fetch 시도 없이 커밋 데이터 (기존 동작 불변)", async () => {
    delete process.env.CORPUS_S3_BUCKET;
    clearEnvCache();
    const fetchCorpus = vi.fn();
    const d = await loadRuntimeCorpus({ fetchCorpus, now: () => 0 });
    expect(fetchCorpus).not.toHaveBeenCalled();
    expect(d.chunks.length).toBeGreaterThan(0);
  });

  it("corpus 형식 불량(chunks 비배열) — 폴백", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchCorpus = vi.fn().mockResolvedValue('{"version":"1","chunks":"bad"}');
    const d = await loadRuntimeCorpus({ fetchCorpus, now: () => 0 });
    expect(d.chunks.length).toBeGreaterThan(0);
    expect(d.chunks[0]!.embedding.length).toBeGreaterThan(0);
  });
});
