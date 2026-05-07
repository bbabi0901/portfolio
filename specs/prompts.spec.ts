import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  detectLanguage,
  formatCitationsBlock,
  NO_RECORD_RESPONSE_KO,
  NO_RECORD_RESPONSE_EN,
} from "@/lib/prompts";
import type { PortfolioChunk } from "@/types/portfolio";

function makeChunk(overrides: Partial<PortfolioChunk> = {}): PortfolioChunk {
  return {
    id: "page-1::0",
    sourcePageId: "page-1",
    sourceTitle: "MFE 마이그레이션 TF",
    sourceUrl: "https://www.notion.so/page-1",
    category: "project",
    headingPath: ["아키텍처", "Bidirectional Federation"],
    text: "Module Federation 을 Vite 기반으로 전환했습니다.",
    tokens: 30,
    embedding: [],
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  it("chunks 비어있을 때 NO_RECORD 응답 강제 문구 포함", () => {
    const out = buildSystemPrompt({ chunks: [] });
    expect(out).toContain(NO_RECORD_RESPONSE_KO);
  });

  it("language='en' 빈 chunks → NO_RECORD_EN 강제", () => {
    const out = buildSystemPrompt({ chunks: [], language: "en" });
    expect(out).toContain(NO_RECORD_RESPONSE_EN);
  });

  it("chunks 의 sourceTitle, headingPath, sourceUrl, text 모두 직렬화", () => {
    const chunk = makeChunk();
    const out = buildSystemPrompt({ chunks: [chunk] });
    expect(out).toContain("MFE 마이그레이션 TF");
    expect(out).toContain("아키텍처");
    expect(out).toContain("Bidirectional Federation");
    expect(out).toContain("https://www.notion.so/page-1");
    expect(out).toContain("Module Federation 을 Vite 기반으로 전환했습니다.");
  });

  it("거부 규칙 5종 모두 system prompt 에 명시", () => {
    const out = buildSystemPrompt({ chunks: [makeChunk()] });
    // 1. "이전 지시 무시" 류 거부
    expect(out).toMatch(/이전 지시|이전 규칙|previous instructions/i);
    // 2. "[SYSTEM]" role spoofing 거부
    expect(out).toMatch(/\[SYSTEM\]|system role|시스템 역할/i);
    // 3. role-play 거부
    expect(out).toMatch(/role-?play|역할극|페르소나|persona/i);
    // 4. 시스템 프롬프트 노출 거부
    expect(out).toMatch(/시스템 프롬프트|system prompt|규칙 노출/i);
    // 5. 사적/민감 정보 거부
    expect(out).toMatch(/연봉|거주지|가족|민감|salary|address|sensitive/i);
  });

  it("language='en' 시 영어 톤 가이드 적용", () => {
    const out = buildSystemPrompt({ chunks: [makeChunk()], language: "en" });
    expect(out).toMatch(/respond in english|english/i);
  });

  it("language='ko' (default) 시 한국어 톤 가이드 적용", () => {
    const out = buildSystemPrompt({ chunks: [makeChunk()] });
    expect(out).toMatch(/한국어|1인칭|저/);
  });

  it("ownerName 미지정 시 '김윤수' 기본값", () => {
    const out = buildSystemPrompt({ chunks: [makeChunk()] });
    expect(out).toContain("김윤수");
  });

  it("ownerName 지정 시 그 이름 사용", () => {
    const out = buildSystemPrompt({ chunks: [makeChunk()], ownerName: "홍길동" });
    expect(out).toContain("홍길동");
    expect(out).not.toContain("김윤수");
  });

  it("여러 chunks 모두 직렬화 + 구분자 포함", () => {
    const a = makeChunk({ id: "a::0", sourceTitle: "A", sourceUrl: "https://www.notion.so/a", text: "AAA" });
    const b = makeChunk({ id: "b::0", sourceTitle: "B", sourceUrl: "https://www.notion.so/b", text: "BBB" });
    const out = buildSystemPrompt({ chunks: [a, b] });
    expect(out).toContain("AAA");
    expect(out).toContain("BBB");
    expect(out).toContain("https://www.notion.so/a");
    expect(out).toContain("https://www.notion.so/b");
  });

  it("chunk text 를 truncate 하지 않는다 (긴 본문 그대로)", () => {
    const longText = "가".repeat(2000);
    const chunk = makeChunk({ text: longText });
    const out = buildSystemPrompt({ chunks: [chunk] });
    expect(out).toContain(longText);
  });

  it("headingPath 빈 배열도 정상 직렬화", () => {
    const chunk = makeChunk({ headingPath: [] });
    const out = buildSystemPrompt({ chunks: [chunk] });
    expect(out).toContain(chunk.sourceTitle);
    expect(out).toContain(chunk.text);
  });
});

describe("detectLanguage", () => {
  it("한글 비율 >50% → ko", () => {
    expect(detectLanguage("Module Federation 어떻게 하셨나요?")).toBe("ko");
    expect(detectLanguage("MFE 마이그레이션이 궁금합니다")).toBe("ko");
  });

  it("영문 비율 >50% → en", () => {
    expect(detectLanguage("Tell me about your MFE migration")).toBe("en");
    expect(detectLanguage("How did you handle Module Federation?")).toBe("en");
  });

  it("빈 문자열 → ko", () => {
    expect(detectLanguage("")).toBe("ko");
  });

  it("숫자/특수문자만 → ko (fallback)", () => {
    expect(detectLanguage("12345 !@#$%")).toBe("ko");
    expect(detectLanguage("???")).toBe("ko");
  });

  it("공백만 → ko", () => {
    expect(detectLanguage("   ")).toBe("ko");
  });
});

describe("formatCitationsBlock", () => {
  it("chunks 의 sourceUrl 을 마크다운 링크로 직렬화", () => {
    const chunk = makeChunk();
    const out = formatCitationsBlock([chunk]);
    expect(out).toContain("[MFE 마이그레이션 TF](https://www.notion.so/page-1)");
  });

  it("빈 배열 → 빈 문자열", () => {
    expect(formatCitationsBlock([])).toBe("");
  });

  it("중복 sourceUrl 은 한 번만 노출", () => {
    const a = makeChunk({ id: "a::0", sourceUrl: "https://www.notion.so/x", sourceTitle: "X" });
    const b = makeChunk({ id: "a::1", sourceUrl: "https://www.notion.so/x", sourceTitle: "X" });
    const out = formatCitationsBlock([a, b]);
    const matches = out.match(/https:\/\/www\.notion\.so\/x/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
