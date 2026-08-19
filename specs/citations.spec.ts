import { describe, it, expect } from "vitest";
import { buildSourcesHeader, parseSourcesHeader } from "@/lib/citations";
import type { PortfolioChunk } from "@/types/portfolio";

const mk = (sourceTitle: string, id = sourceTitle): PortfolioChunk => ({
  id,
  sourcePageId: "p",
  sourceTitle,
  sourceUrl: "https://notion.so/x",
  category: "project",
  headingPath: [],
  text: "t",
  tokens: 1,
  embedding: [],
});

// TS-100 — 답변 출처 칩: 서버 헤더 인코딩 ↔ 클라이언트 파싱 왕복 계약
describe("citations (TS-100)", () => {
  it("buildSourcesHeader — 검색 순서 유지 + 문서 단위 중복 제거 + 최대 4개", () => {
    const chunks = [
      mk("이력서", "a"),
      mk("이력서", "b"),
      mk("Web3 소셜", "c"),
      mk("빵대빵", "d"),
      mk("텔레그램", "e"),
      mk("AI 포트폴리오", "f"),
    ];
    const header = buildSourcesHeader(chunks);
    const parsed = parseSourcesHeader(header);
    expect(parsed.map((c) => c.sourceTitle)).toEqual(["이력서", "Web3 소셜", "빵대빵", "텔레그램"]);
  });

  it("한국어 제목이 헤더 안전(ASCII) 인코딩으로 왕복 보존된다", () => {
    const header = buildSourcesHeader([mk("한국어 · 제목 — 테스트")]);
    expect(/^[\x20-\x7e]*$/.test(header)).toBe(true); // HTTP 헤더 안전
    expect(parseSourcesHeader(header)[0]!.sourceTitle).toBe("한국어 · 제목 — 테스트");
  });

  it("노션 비공개 — sourceUrl 은 null (비공개 칩 렌더 계약)", () => {
    const parsed = parseSourcesHeader(buildSourcesHeader([mk("이력서")]));
    expect(parsed[0]!.sourceUrl).toBeNull();
  });

  it("parseSourcesHeader — null·빈 값·불량 JSON 은 빈 배열 (렌더 생략)", () => {
    expect(parseSourcesHeader(null)).toEqual([]);
    expect(parseSourcesHeader("")).toEqual([]);
    expect(parseSourcesHeader("%7Bnot-json")).toEqual([]);
  });

  it("빈 청크 목록 → 빈 헤더 문자열", () => {
    expect(buildSourcesHeader([])).toBe("");
  });
});

describe("stash/take 홀더 (TS-100)", () => {
  it("stash 후 take 는 1회성 — 두 번째 take 는 null", async () => {
    const { stashSources, takeSources } = await import("@/lib/citations");
    stashSources([{ sourceTitle: "이력서", sourceUrl: null }]);
    expect(takeSources()?.[0]?.sourceTitle).toBe("이력서");
    expect(takeSources()).toBeNull();
  });

  it("빈 배열 stash 는 null 로 정규화", async () => {
    const { stashSources, takeSources } = await import("@/lib/citations");
    stashSources([]);
    expect(takeSources()).toBeNull();
  });
});
