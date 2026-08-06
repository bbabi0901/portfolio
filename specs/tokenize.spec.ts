import { describe, it, expect } from "vitest";
import { tokenize, estimateTokens, extractKeywords } from "@/lib/tokenize";

describe("tokenize", () => {
  it("splits Korean syllables", () => {
    const t = tokenize("Module Federation 마이그레이션");
    expect(t).toContain("module");
    expect(t).toContain("federation");
    expect(t).toContain("마이그레이션");
  });

  it("normalizes case", () => {
    expect(tokenize("React.js")).toContain("react");
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("filters single-char Korean particles", () => {
    expect(tokenize("을 를 는 의")).toEqual([]);
  });
});

describe("estimateTokens", () => {
  it("is deterministic", () => {
    expect(estimateTokens("Hello")).toBe(estimateTokens("Hello"));
  });

  it("scales with length", () => {
    expect(estimateTokens("a".repeat(400))).toBeGreaterThan(estimateTokens("a".repeat(100)));
  });

  it("returns 0 for empty", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("extractKeywords", () => {
  it("returns top-N", () => {
    const kw = extractKeywords("Next.js Turbopack Turbopack Module Module Module Federation", 3);
    expect(kw).toHaveLength(3);
    expect(kw[0]?.toLowerCase()).toBe("module");
  });
});

// TS-96 (EC-53) — 한국어 조사 제거: 조사 변형 질의가 본문과 매칭되도록
describe("korean particle stripping (TS-96)", () => {
  it("같은 명사의 조사 변형들이 동일 토큰으로 정규화된다", () => {
    expect(tokenize("취미는")).toEqual(["취미"]);
    expect(tokenize("취미가")).toEqual(["취미"]);
    expect(tokenize("취미를")).toEqual(["취미"]);
    expect(tokenize("프론트엔드에서")).toEqual(["프론트엔드"]);
    expect(tokenize("리액트로")).toEqual(["리액트"]);
    expect(tokenize("온보딩과")).toEqual(["온보딩"]);
  });

  it("어간 2자 미만이 되는 제거는 하지 않는다 (사과·결과·나이 보존)", () => {
    expect(tokenize("사과")).toEqual(["사과"]);
    expect(tokenize("결과")).toEqual(["결과"]);
    expect(tokenize("나이")).toEqual(["나이"]);
    expect(tokenize("지도")).toEqual(["지도"]);
    expect(tokenize("성과")).toEqual(["성과"]);
  });

  it("프로덕션 실사례 — '취미는 뭔가요?' 질의가 '취미가 다양' 본문과 키워드 교집합을 가진다", () => {
    const q = new Set(tokenize("취미는 뭔가요?"));
    const doc = new Set(tokenize("저는 취미가 다양한 편입니다"));
    const overlap = [...q].filter((t) => doc.has(t));
    expect(overlap).toContain("취미");
  });
});
