import { describe, it, expect } from "vitest";
import { toCorpus, buildServerData } from "@/lib/sync/core";
import type { NotionPageContent } from "@/types/notion";
import type { PortfolioChunk, PortfolioServerData } from "@/types/portfolio";

const mkChunk = (id: string, over: Partial<PortfolioChunk> = {}): PortfolioChunk => ({
  id,
  sourcePageId: over.sourcePageId ?? "page-1",
  sourceTitle: "제목",
  sourceUrl: "https://notion.so/x",
  category: "project",
  headingPath: ["h1"],
  text: `본문 ${id}`,
  tokens: 10,
  embedding: [0.1, 0.2, 0.3],
  ...over,
});

const mkData = (chunks: PortfolioChunk[]): PortfolioServerData => ({
  version: "0.7.4",
  generatedAt: "2026-08-05T12:00:00+09:00",
  chunks,
  suggestedQuestions: [{ id: "q1", category: "c", text: "t", expectedSourceTitles: [] }],
  profile: { name: "김윤수", oneLiner: "x", contact: { email: "e@e.com" } },
});

describe("sync core (FEAT-038)", () => {
  it("toCorpus — 청크에서 embedding 만 제거, 나머지 필드·개수·메타 보존", () => {
    const data = mkData([mkChunk("a"), mkChunk("b", { tags: ["t"] })]);
    const corpus = toCorpus(data);
    expect(corpus.chunks).toHaveLength(2);
    expect(corpus.chunks[0]).not.toHaveProperty("embedding");
    expect(corpus.chunks[0]).toMatchObject({ id: "a", text: "본문 a", tokens: 10 });
    expect(corpus.chunks[1]!.tags).toEqual(["t"]);
    expect(corpus.version).toBe(data.version);
    expect(corpus.generatedAt).toBe(data.generatedAt);
    expect(corpus.suggestedQuestions).toEqual(data.suggestedQuestions);
    expect(corpus.profile).toEqual(data.profile);
    // 원본은 불변
    expect(data.chunks[0]!.embedding).toHaveLength(3);
  });

  it("buildServerData — 청크 정렬(sourcePageId→headingPath→id) 결정성 + 메타 주입", () => {
    const pages: NotionPageContent[] = [];
    const chunks = [
      mkChunk("z", { sourcePageId: "p2" }),
      mkChunk("b", { sourcePageId: "p1" }),
      mkChunk("a", { sourcePageId: "p1" }),
    ];
    const data = buildServerData({
      chunks,
      pages,
      profileIdSet: new Set<string>(),
      suggestedQuestions: [],
      version: "1.2.3",
      generatedAt: "2026-08-05T00:00:00+09:00",
    });
    expect(data.version).toBe("1.2.3");
    expect(data.generatedAt).toBe("2026-08-05T00:00:00+09:00");
    expect(data.chunks.map((c) => c.id)).toEqual(["a", "b", "z"]);
    expect(data.profile.name).toBe("김윤수"); // 프로필 페이지 없음 → 폴백
  });
});
