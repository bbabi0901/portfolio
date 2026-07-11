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

  const personalChunk = {
    id: "p1",
    sourcePageId: "p1",
    sourceTitle: "성격",
    sourceUrl: "https://www.notion.so/p1",
    category: "personal" as const,
    headingPath: ["성격"],
    text: "ENFP",
    tokens: 2,
    embedding: [0.1],
  };

  function eduChunk(id: string, sub: string, text: string) {
    return {
      id,
      sourcePageId: "resume",
      sourceTitle: "이력서",
      sourceUrl: "https://www.notion.so/resume",
      category: "career" as const,
      headingPath: ["교육 기관 (Education)", sub],
      text,
      tokens: 20,
      embedding: [0.1],
    };
  }

  it("교육 청크 중 대학(학사)만 education 으로 — 부트캠프 제외", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        personalChunk,
        eduChunk("edu-boot", "코드스테이츠 BEB 7기", "> 2022.09 - 2023.02\n> Bootcamp 수료"),
        eduChunk("edu-univ", "고려대학교 신소재공학부", "> 2012.02 - 2018.03"),
      ]),
    );
    const result = loadProfileData();
    expect(result!.education).toHaveLength(1);
    expect(result!.education![0]!.title).toBe("고려대학교 신소재공학부");
    expect(result!.education![0]!.period).toBe("2012.02 - 2018.03");
  });

  it("교육 청크 없음 → education undefined", () => {
    mockedLoadPortfolio.mockReturnValue(makeData([personalChunk]));
    expect(loadProfileData()!.education).toBeUndefined();
  });

  it("자격증 청크 → certifications (title + 발급기관 subtitle)", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        personalChunk,
        {
          id: "cert-aws",
          sourcePageId: "resume",
          sourceTitle: "이력서",
          sourceUrl: "https://www.notion.so/resume",
          category: "career" as const,
          headingPath: ["자격증 (Certification)", "AWS Certified AI Practitioner"],
          text: "> Amazon Web Services",
          tokens: 8,
          embedding: [0.1],
        },
      ]),
    );
    const result = loadProfileData();
    expect(result!.certifications).toHaveLength(1);
    expect(result!.certifications![0]!.title).toBe("AWS Certified AI Practitioner");
    expect(result!.certifications![0]!.subtitle).toBe("Amazon Web Services");
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

describe("loadProfileData — career 타임라인 (ADR-028 career 청크 재구성)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function careerChunk(
    id: string,
    headingPath: string[],
    text: string,
    order: number,
  ): PortfolioServerData["chunks"][number] {
    return {
      id,
      sourcePageId: "resume",
      sourceTitle: "이력서",
      sourceUrl: "https://www.notion.so/resume",
      category: "career",
      headingPath,
      text,
      tokens: 50,
      embedding: [0.1],
      order,
    };
  }

  const personal = {
    id: "p1",
    sourcePageId: "p1",
    sourceTitle: "성격",
    sourceUrl: "https://www.notion.so/p1",
    category: "personal" as const,
    headingPath: ["성격"],
    text: "ENFP",
    tokens: 2,
    embedding: [0.1],
  };

  it("직무 및 이력 career 청크들 → career 섹션으로 재구성 (문서 순서 + 헤딩 재합성)", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        personal,
        // 실제 이력서 구조 모사: H2 본문에 첫 회사 callout, H3 프로젝트 청크들,
        // 마지막 프로젝트 청크 끝에 다음 회사 callout(트레일링) 포함.
        careerChunk(
          "c1",
          ["직무 및 이력 (Experience)"],
          "> **소프트웨어 엔지니어  \n> | 디라티오**\n\n> 2025.01 - 현재\n\n---",
          2,
        ),
        careerChunk(
          "c3",
          ["직무 및 이력 (Experience)", "밈코인 통합 소셜 플랫폼"],
          "- FSD 아키텍처 전면 도입\n\n> **소프트웨어 엔지니어  \n> | 체인아나토미**\n\n> 2023.05 - 2025.01\n\n---",
          4,
        ),
        // 정렬 검증: order 가 뒤섞여 들어와도 order 순으로 재구성돼야 함
        careerChunk(
          "c2",
          ["직무 및 이력 (Experience)", "Micro-Frontend Architecture 마이그레이션 TF"],
          "- 모놀리식 → MFE 전환 TF 주도",
          3,
        ),
      ]),
    );
    const result = loadProfileData();
    expect(result!.career).toBeDefined();
    const body = result!.career!.subSections.map((s) => s.body).join("\n");
    // 헤딩 재합성: H3 프로젝트명이 body 에 ### 로 복원돼야 parseCareerMarkdown 이 그룹핑 가능
    expect(body).toContain("### Micro-Frontend Architecture 마이그레이션 TF");
    expect(body).toContain("### 밈코인 통합 소셜 플랫폼");
    // 문서 순서: MFE(order 3)가 밈코인(order 4)보다 먼저
    expect(body.indexOf("Micro-Frontend")).toBeLessThan(body.indexOf("밈코인 통합 소셜 플랫폼"));
    // 회사 callout 보존
    expect(body).toContain("| 디라티오");
    expect(body).toContain("| 체인아나토미");
  });

  it("자체 프로젝트 (Personal Project) 청크도 career 섹션에 포함 (이력서 단일 소스)", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        personal,
        careerChunk(
          "c1",
          ["직무 및 이력 (Experience)"],
          "> **소프트웨어 엔지니어  \n> | 디라티오**\n\n> 2025.01 - 현재\n\n---",
          2,
        ),
        careerChunk(
          "s1",
          ["자체 프로젝트 (Personal Project)"],
          "> **| 자체 프로젝트**\n\n> 2026.05 - 현재\n\n---",
          10,
        ),
        careerChunk(
          "s2",
          ["자체 프로젝트 (Personal Project)", "AI 포트폴리오 (대화형 포트폴리오)"],
          "- 직접 코드를 작성하지 않은 no-code 개발",
          11,
        ),
      ]),
    );
    const result = loadProfileData();
    const body = result!.career!.subSections.map((s) => s.body).join("\n");
    expect(body).toContain("| 자체 프로젝트");
    expect(body).toContain("### AI 포트폴리오 (대화형 포트폴리오)");
    // 문서 순서 유지: 회사 경력 뒤에 자체 프로젝트
    expect(body.indexOf("| 디라티오")).toBeLessThan(body.indexOf("| 자체 프로젝트"));
  });

  it("교육/이름 career 청크는 career 섹션에서 제외", () => {
    mockedLoadPortfolio.mockReturnValue(
      makeData([
        personal,
        careerChunk("e1", ["교육 기관 (Education)", "고려대학교 신소재공학부"], "학사", 8),
        careerChunk("n1", ["이름 : 김윤수"], "연락처 010", 0),
      ]),
    );
    const result = loadProfileData();
    expect(result!.career).toBeUndefined();
  });

  it("career 청크 없음 → career undefined (기존 동작 유지)", () => {
    mockedLoadPortfolio.mockReturnValue(makeData([personal]));
    expect(loadProfileData()!.career).toBeUndefined();
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
