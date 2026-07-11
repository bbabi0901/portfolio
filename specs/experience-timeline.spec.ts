import { describe, it, expect } from "vitest";
import { buildUnifiedTimeline } from "@/lib/experience-timeline";

// 이력서(career) 마크다운 단일 소스 — 회사 경력 + 자체 프로젝트 항목이 같은
// blockquote 포맷(`> | 회사`, `> 기간`)으로 들어있다.
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
  "",
  "> **| 자체 프로젝트**",
  "",
  "> 2026.05 - 현재",
  "",
  "---",
  "### AI 포트폴리오 (대화형 포트폴리오)",
  "- 직접 코드를 작성하지 않은 no-code 개발 — AI 에이전트와 하네스 워크플로우만으로 개발",
].join("\n");

describe("buildUnifiedTimeline (이력서 단일 소스 타임라인)", () => {
  it("이력서 마크다운의 회사·자체 프로젝트 항목을 시작일 내림차순으로 정렬", () => {
    const items = buildUnifiedTimeline(CAREER_BODY);
    expect(items.map((i) => i.entry.company)).toEqual(["자체 프로젝트", "디라티오", "체인아나토미"]);
  });

  it("자체 프로젝트 항목: 역할 없음(폴백 미적용) + 프로젝트명 그룹 + 진행 중", () => {
    const items = buildUnifiedTimeline(CAREER_BODY);
    const personal = items[0]!.entry;
    expect(personal.company).toBe("자체 프로젝트");
    expect(personal.role).toBe("");
    expect(personal.isActive).toBe(true);
    expect(personal.bulletGroups[0]?.[0]).toBe("AI 포트폴리오 (대화형 포트폴리오)");
    expect(personal.bulletGroups[0]?.[1]).toContain("no-code 개발");
  });

  it("기간 없는 항목은 마지막", () => {
    const body = ["> | 무기간", "", "---", "- 항목", "", CAREER_BODY].join("\n");
    const items = buildUnifiedTimeline(body);
    expect(items[items.length - 1]!.entry.company).toBe("무기간");
  });

  it("커리어 본문 없음 → 빈 타임라인", () => {
    expect(buildUnifiedTimeline(undefined)).toEqual([]);
  });
});
