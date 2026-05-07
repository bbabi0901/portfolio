import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PortfolioChunk, PortfolioServerData } from "@/types/portfolio";

vi.mock("@/lib/portfolio-data", () => ({
  loadPortfolio: vi.fn(),
}));

import { loadPortfolio } from "@/lib/portfolio-data";
import { loadExperienceData } from "@/lib/experience-data";

const mockedLoadPortfolio = vi.mocked(loadPortfolio);

function makeData(chunks: PortfolioChunk[]): PortfolioServerData {
  return {
    version: "0.1.0",
    generatedAt: "2026-05-07T10:00:00Z",
    chunks,
    suggestedQuestions: [],
    profile: {
      name: "김윤수",
      oneLiner: "프론트엔드 + 스마트컨트랙트 개발자",
      contact: { email: "x@y.com" },
    },
  };
}

function projectChunk(over: Partial<PortfolioChunk>): PortfolioChunk {
  return {
    id: "c1",
    sourcePageId: "page-mfe",
    sourceTitle: "MFE TF",
    sourceUrl: "https://www.notion.so/page-mfe",
    category: "project",
    headingPath: ["개요"],
    text: "프로젝트 본문",
    tokens: 50,
    embedding: [0.1],
    tags: ["mfe", "module-federation"],
    ...over,
  };
}

describe("loadExperienceData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("회사별 그룹화", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        projectChunk({
          id: "1",
          sourcePageId: "p-mfe",
          sourceTitle: "MFE TF",
          projectMeta: {
            notionCategory: "업무",
            company: "디라티오",
            period: { start: "2025.01", ongoing: true },
          },
        }),
        projectChunk({
          id: "2",
          sourcePageId: "p-meme",
          sourceTitle: "밈코인 통합 소셜 플랫폼",
          projectMeta: {
            notionCategory: "업무",
            company: "디라티오",
            period: { start: "2025.03", ongoing: true },
          },
        }),
        projectChunk({
          id: "3",
          sourcePageId: "p-anatomy",
          sourceTitle: "인터체인 NFT",
          projectMeta: {
            notionCategory: "업무",
            company: "체인아나토미",
            period: { start: "2023.05", end: "2025.01" },
          },
        }),
      ]),
    );
    const result = loadExperienceData();
    expect(result.groups).toHaveLength(2);
    const dilatio = result.groups.find((g) => g.company === "디라티오");
    expect(dilatio).toBeDefined();
    expect(dilatio!.projects).toHaveLength(2);
    const anatomy = result.groups.find((g) => g.company === "체인아나토미");
    expect(anatomy).toBeDefined();
    expect(anatomy!.projects).toHaveLength(1);
  });

  it("회사 없는 자체프로젝트 → others", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        projectChunk({
          id: "1",
          sourcePageId: "p-weju",
          sourceTitle: "weju",
          projectMeta: {
            notionCategory: "자체프로젝트",
          },
        }),
        projectChunk({
          id: "2",
          sourcePageId: "p-mfe",
          sourceTitle: "MFE TF",
          projectMeta: {
            notionCategory: "업무",
            company: "디라티오",
            period: { start: "2025.01", ongoing: true },
          },
        }),
      ]),
    );
    const result = loadExperienceData();
    expect(result.others).toHaveLength(1);
    expect(result.others[0]?.title).toBe("weju");
    expect(result.groups).toHaveLength(1);
  });

  it("기간 텍스트 포맷 'YYYY.MM — 현재'", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        projectChunk({
          id: "1",
          sourcePageId: "p-mfe",
          projectMeta: {
            notionCategory: "업무",
            company: "디라티오",
            period: { start: "2025.01", ongoing: true },
          },
        }),
      ]),
    );
    const result = loadExperienceData();
    expect(result.groups[0]?.period).toMatch(/2025\.01.*현재/);
  });

  it("스킬 데이터 분리 (frontend / smartContract)", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        projectChunk({
          id: "s1",
          category: "skill",
          headingPath: ["Frontend"],
          text: "TypeScript · React · Next.js",
          tags: ["typescript", "react", "next.js"],
        }),
        projectChunk({
          id: "s2",
          category: "skill",
          headingPath: ["Smart Contract"],
          text: "Solidity · Foundry · Hardhat",
          tags: ["solidity", "foundry", "hardhat"],
        }),
      ]),
    );
    const result = loadExperienceData();
    expect(result.skills.frontend.length).toBeGreaterThan(0);
    expect(result.skills.smartContract.length).toBeGreaterThan(0);
    expect(result.skills.frontend).toContain("TypeScript");
  });

  it("프로젝트 청크 0건 → groups + others 빈 배열", () => {
    mockedLoadPortfolio.mockReturnValue(makeData([]));
    const result = loadExperienceData();
    expect(result.groups).toEqual([]);
    expect(result.others).toEqual([]);
  });

  it("동일 sourcePageId 의 다중 청크는 하나의 ProjectSummary 로 합쳐진다", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        projectChunk({
          id: "a",
          sourcePageId: "p-mfe",
          sourceTitle: "MFE TF",
          headingPath: ["개요"],
          text: "한 줄 요약",
          tags: ["mfe"],
          projectMeta: { notionCategory: "업무", company: "디라티오" },
        }),
        projectChunk({
          id: "b",
          sourcePageId: "p-mfe",
          sourceTitle: "MFE TF",
          headingPath: ["트러블슈팅"],
          text: "기타",
          tags: ["webpack"],
          projectMeta: { notionCategory: "업무", company: "디라티오" },
        }),
      ]),
    );
    const result = loadExperienceData();
    const proj = result.groups[0]?.projects[0];
    expect(proj).toBeDefined();
    expect(proj!.id).toBe("p-mfe");
    expect(proj!.techKeywords).toEqual(expect.arrayContaining(["mfe", "webpack"]));
  });

  it("projectMeta 없는 project 청크 → notionCategory 추정 없음 → others 로", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        projectChunk({
          id: "1",
          sourcePageId: "p-x",
          sourceTitle: "X",
        }),
      ]),
    );
    const result = loadExperienceData();
    expect(result.others).toHaveLength(1);
  });
});
