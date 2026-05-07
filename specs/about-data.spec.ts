import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PortfolioServerData } from "@/types/portfolio";

vi.mock("@/lib/portfolio-data", () => ({
  loadPortfolio: vi.fn(),
}));

import { loadPortfolio } from "@/lib/portfolio-data";
import { loadProfileData, calculateReadingMinutes } from "@/lib/profile-data";

const mockedLoadPortfolio = vi.mocked(loadPortfolio);

function makeData(
  chunks: PortfolioServerData["chunks"],
  profile?: Partial<PortfolioServerData["profile"]>,
): PortfolioServerData {
  return {
    version: "0.1.0",
    generatedAt: "2026-05-07T10:00:00Z",
    chunks,
    suggestedQuestions: [],
    profile: {
      name: "김윤수",
      oneLiner: "프론트엔드 + 스마트컨트랙트 개발자",
      contact: { email: "x@y.com" },
      ...profile,
    },
  };
}

describe("loadProfileData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("프로필 청크 없음 → null", () => {
    mockedLoadPortfolio.mockReturnValue(makeData([]));
    expect(loadProfileData()).toBeNull();
  });

  it("프로필 카테고리 외 청크만 → null", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        {
          id: "p1",
          sourcePageId: "a",
          sourceTitle: "프로젝트",
          sourceUrl: "https://www.notion.so/a",
          category: "project",
          headingPath: ["개요"],
          text: "...",
          tokens: 10,
          embedding: [0.1],
        },
      ]),
    );
    expect(loadProfileData()).toBeNull();
  });

  it("personal 청크 있음 → intro + sections 그룹화", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        {
          id: "1",
          sourcePageId: "p1",
          sourceTitle: "성격",
          sourceUrl: "https://www.notion.so/p1",
          category: "personal",
          headingPath: ["성격"],
          text: "ENFP입니다.",
          tokens: 5,
          embedding: [0.1],
        },
        {
          id: "2",
          sourcePageId: "p2",
          sourceTitle: "취미",
          sourceUrl: "https://www.notion.so/p2",
          category: "personal",
          headingPath: ["취미"],
          text: "독서, 등산.",
          tokens: 4,
          embedding: [0.1],
        },
      ]),
    );
    const result = loadProfileData();
    expect(result).not.toBeNull();
    expect(result!.intro).toBe("프론트엔드 + 스마트컨트랙트 개발자");
    expect(result!.sections).toHaveLength(2);
    expect(result!.sections[0]?.heading).toBe("성격");
    expect(result!.sections[1]?.heading).toBe("취미");
  });

  it("H3 → subSections 로 그룹화", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        {
          id: "1",
          sourcePageId: "p1",
          sourceTitle: "성격",
          sourceUrl: "https://www.notion.so/p1",
          category: "personal",
          headingPath: ["성격", "MBTI"],
          text: "ENFP",
          tokens: 2,
          embedding: [0.1],
        },
        {
          id: "2",
          sourcePageId: "p1",
          sourceTitle: "성격",
          sourceUrl: "https://www.notion.so/p1",
          category: "personal",
          headingPath: ["성격", "강점"],
          text: "긍정적",
          tokens: 2,
          embedding: [0.1],
        },
      ]),
    );
    const result = loadProfileData();
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0]?.subSections).toHaveLength(2);
    expect(result!.sections[0]?.subSections[0]?.heading).toBe("MBTI");
    expect(result!.sections[0]?.subSections[1]?.heading).toBe("강점");
  });

  it("totalReadingMinutes = sections 합계 이상", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        {
          id: "1",
          sourcePageId: "p1",
          sourceTitle: "성격",
          sourceUrl: "https://www.notion.so/p1",
          category: "personal",
          headingPath: ["성격"],
          text: "가".repeat(400),
          tokens: 100,
          embedding: [0.1],
        },
      ]),
    );
    const result = loadProfileData();
    expect(result!.totalReadingMinutes).toBeGreaterThanOrEqual(1);
  });

  it("career 청크 있으면 intro 를 첫 본문 라인으로 추출", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        {
          id: "c1",
          sourcePageId: "resume",
          sourceTitle: "김윤수 이력서",
          sourceUrl: "https://www.notion.so/resume",
          category: "career",
          headingPath: ["About Me"],
          text: "MFE 마이그레이션을 주도했습니다.\n\n나머지 본문.",
          tokens: 30,
          embedding: [0.1],
        },
        {
          id: "p1",
          sourcePageId: "p1",
          sourceTitle: "성격",
          sourceUrl: "https://www.notion.so/p1",
          category: "personal",
          headingPath: ["성격"],
          text: "ENFP",
          tokens: 2,
          embedding: [0.1],
        },
      ]),
    );
    const result = loadProfileData();
    expect(result!.intro).toBe("MFE 마이그레이션을 주도했습니다.");
  });
});

describe("calculateReadingMinutes", () => {
  it("한국어 200글자 → 1분", () => {
    const r = calculateReadingMinutes("가".repeat(200));
    expect(r.minutes).toBe(1);
  });

  it("영어 200단어 → 1분", () => {
    const text = Array.from({ length: 200 }, () => "word").join(" ");
    const r = calculateReadingMinutes(text);
    expect(r.minutes).toBe(1);
  });

  it("빈 문자열 → 0분", () => {
    expect(calculateReadingMinutes("").minutes).toBe(0);
    expect(calculateReadingMinutes("   ").minutes).toBe(0);
  });
});
