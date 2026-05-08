import type { PortfolioServerData, PortfolioChunk } from "@/types/portfolio";

/** Deterministic 1536-dim embedding (first slot=1, rest=0). E2E 흐름 검증용. */
function fixtureEmbedding(): number[] {
  const v = new Array(1536).fill(0);
  v[0] = 1;
  return v;
}

const CHUNKS: PortfolioChunk[] = [
  {
    id: "fx-intro-1",
    sourcePageId: "fixture-resume",
    sourceTitle: "이력서",
    sourceUrl: "https://www.notion.so/fixture-resume",
    category: "intro",
    headingPath: ["About Me"],
    text: "안녕하세요, 김윤수입니다. 3년차 프론트엔드 + 스마트컨트랙트 개발자입니다.",
    tokens: 32,
    embedding: fixtureEmbedding(),
  },
  {
    id: "fx-personal-1",
    sourcePageId: "fixture-profile",
    sourceTitle: "자기소개",
    sourceUrl: "https://www.notion.so/fixture-profile",
    category: "personal",
    headingPath: ["가치관"],
    text: "코드는 의사 결정의 결과라고 생각합니다. 트레이드오프를 명시적으로 적습니다.",
    tokens: 30,
    embedding: fixtureEmbedding(),
  },
  {
    id: "fx-project-1",
    sourcePageId: "fixture-project-1",
    sourceTitle: "MFE 마이그레이션 TF",
    sourceUrl: "https://www.notion.so/fixture-project-1",
    category: "project",
    headingPath: ["개요"],
    text: "Module Federation 기반 마이크로프론트엔드 마이그레이션. Vite Bidirectional Federation, Singleton Shared, SIWE.",
    tokens: 35,
    embedding: fixtureEmbedding(),
    projectMeta: {
      notionCategory: "업무",
      company: "디라티오",
      role: "프론트엔드 개발자",
      period: { start: "2025.11", end: "2025.12" },
    },
  },
  {
    id: "fx-project-2",
    sourcePageId: "fixture-project-2",
    sourceTitle: "밈코인 통합 소셜 플랫폼",
    sourceUrl: "https://www.notion.so/fixture-project-2",
    category: "project",
    headingPath: ["DM 시스템"],
    text: "Centrifugo 기반 실시간 DM. viewport 보존 무한스크롤, IME 3중 체크, debounced read receipt.",
    tokens: 30,
    embedding: fixtureEmbedding(),
    projectMeta: {
      notionCategory: "업무",
      company: "디라티오",
      period: { start: "2025.01", ongoing: true },
    },
  },
  {
    id: "fx-project-private",
    sourcePageId: "fixture-private",
    sourceTitle: "비공개 프로젝트",
    sourceUrl: "",
    category: "project",
    headingPath: [],
    text: "비공개 노션 페이지 - sourceUrl 비어있음.",
    tokens: 12,
    embedding: fixtureEmbedding(),
    projectMeta: { notionCategory: "자체프로젝트" },
  },
  {
    id: "fx-skill-1",
    sourcePageId: "fixture-resume",
    sourceTitle: "이력서",
    sourceUrl: "https://www.notion.so/fixture-resume",
    category: "skill",
    headingPath: ["Skill", "Frontend"],
    text: "TypeScript, React, Next.js, Vite, Module Federation, Tailwind, Recoil/Zustand/React Query.",
    tokens: 28,
    embedding: fixtureEmbedding(),
  },
];

export const E2E_PORTFOLIO_FIXTURE: PortfolioServerData = {
  version: "0.1.0-e2e",
  generatedAt: "2026-05-08T00:00:00+09:00",
  chunks: CHUNKS,
  suggestedQuestions: [
    {
      id: "Q-001",
      category: "intro",
      text: "김윤수 어떤 개발자예요?",
      expectedSourceTitles: ["이력서"],
    },
    {
      id: "Q-005",
      category: "architecture",
      text: "Module Federation 어떻게 적용했어요?",
      expectedSourceTitles: ["MFE 마이그레이션 TF"],
    },
    {
      id: "Q-018",
      category: "contact",
      text: "어떻게 연락하면 돼요?",
      expectedSourceTitles: ["이력서"],
    },
  ],
  profile: {
    name: "김윤수",
    oneLiner: "3년차 프론트엔드 + 스마트컨트랙트 개발자",
    contact: { email: "bbabi0901@gmail.com", github: "https://github.com/YoonsooKim9" },
  },
};
