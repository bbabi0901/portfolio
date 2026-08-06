import { describe, it, expect } from "vitest";
import { expandSelfReferentialQuery } from "@/lib/query-expansion";
import { retrieve } from "@/lib/retriever";
import type { PortfolioChunk, PortfolioServerData } from "@/types/portfolio";

// TS-94 (EC-51) — 자기지칭 질의 확장: "이 프로젝트/사이트" 가 다른 프로젝트 청크에 뺏기지 않게
describe("expandSelfReferentialQuery (TS-94)", () => {
  it.each([
    "이 프로젝트는 어떻게 만들었어요? 어떤 구조를 갖고 있나요?",
    "이 사이트 기술 스택 알려줘",
    "본 포트폴리오는 뭘로 만들었어?",
    "이 서비스 구조가 궁금해요",
    "How did you build this site?",
  ])("자기지칭 질의는 포트폴리오 힌트가 붙는다: %s", (q) => {
    const out = expandSelfReferentialQuery(q);
    expect(out).not.toBe(q);
    expect(out).toContain(q);
    expect(out).toContain("대화형 포트폴리오");
  });

  it.each([
    "빵대빵 프로젝트는 어떻게 만들었어요?",
    "마이크로 프론트엔드 아키텍처를 어떻게 도입했어요?",
    "자주 쓰는 기술 스택은요?",
  ])("일반 질의는 불변: %s", (q) => {
    expect(expandSelfReferentialQuery(q)).toBe(q);
  });

  it("확장 질의로 retrieve 하면 포트폴리오 사이트 청크가 타 프로젝트 청크를 이긴다", () => {
    const mk = (id: string, sourceTitle: string, text: string): PortfolioChunk => ({
      id,
      sourcePageId: id,
      sourceTitle,
      sourceUrl: "https://notion.so/x",
      category: "project",
      headingPath: [],
      text,
      tokens: 30,
      embedding: [],
    });
    const data: PortfolioServerData = {
      version: "1",
      generatedAt: "2026-08-06T00:00:00+09:00",
      chunks: [
        mk(
          "bread",
          "빵대빵 — 빵집 랭킹 앱",
          "이 프로젝트는 빵집 랭킹 앱으로 구조는 지도 홈, 기록 플로우, 랭킹 리스트로 만들었다.",
        ),
        mk(
          "portfolio",
          "AI 포트폴리오 (대화형 포트폴리오)",
          "대화형 포트폴리오 사이트 — Bedrock, S3 Vectors, Lambda 인제스천 구조로 만들었다. AI 포트폴리오.",
        ),
      ],
      suggestedQuestions: [],
      profile: { name: "김윤수", oneLiner: "x", contact: { email: "e@e.com" } },
    };
    const q = "이 프로젝트는 어떻게 만들었어요? 어떤 구조를 갖고 있나요?";
    const expanded = retrieve(expandSelfReferentialQuery(q), data, {});
    expect(expanded.results[0]!.chunk.id).toBe("portfolio");
  });
});
