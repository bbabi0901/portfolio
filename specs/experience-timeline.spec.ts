import { describe, it, expect } from "vitest";
import { buildUnifiedTimeline } from "@/lib/experience-timeline";
import type { ProjectSummary } from "@/lib/experience-data";

const CAREER_BODY = [
  "> **소프트웨어 엔지니어  ",
  "> | 디라티오**",
  "",
  "> 2025.01 - 현재",
  "",
  "---",
  "### MFE TF",
  "- 전환 주도",
  "",
  "> **소프트웨어 엔지니어  ",
  "> | 체인아나토미**",
  "",
  "> 2023.05 - 2025.01",
  "",
  "---",
  "### 런치패드",
  "- 컨트랙트 설계",
].join("\n");

function personal(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "p-ai",
    title: "AI 포트폴리오",
    techKeywords: ["rag"],
    impact: "대화형 포트폴리오",
    category: "자체프로젝트",
    period: { start: "2026-05-01", ongoing: true },
    ...over,
  };
}

describe("buildUnifiedTimeline (커리어 + 자체 프로젝트 통합)", () => {
  it("시작일 내림차순으로 회사·자체 프로젝트를 하나의 타임라인으로 병합", () => {
    const items = buildUnifiedTimeline(CAREER_BODY, [personal()]);
    expect(items.map((i) => i.kind)).toEqual(["personal", "company", "company"]);
    expect(items[0]!.kind === "personal" && items[0]!.project.title).toBe("AI 포트폴리오");
    expect(items[1]!.kind === "company" && items[1]!.entry.company).toBe("디라티오");
    expect(items[2]!.kind === "company" && items[2]!.entry.company).toBe("체인아나토미");
  });

  it("회사 사이 시작일이면 사이에 삽입", () => {
    const items = buildUnifiedTimeline(CAREER_BODY, [
      personal({
        id: "p-mid",
        title: "중간 프로젝트",
        period: { start: "2024-03-01", end: "2024-06-30" },
      }),
    ]);
    expect(items.map((i) => (i.kind === "company" ? i.entry.company : i.project.title))).toEqual([
      "디라티오",
      "중간 프로젝트",
      "체인아나토미",
    ]);
  });

  it("기간 없는 자체 프로젝트는 마지막", () => {
    const items = buildUnifiedTimeline(CAREER_BODY, [personal({ period: undefined })]);
    expect(items[items.length - 1]!.kind).toBe("personal");
  });

  it("커리어 본문 없음 → 자체 프로젝트만", () => {
    const items = buildUnifiedTimeline(undefined, [personal()]);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("personal");
  });
});
