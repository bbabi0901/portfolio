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
