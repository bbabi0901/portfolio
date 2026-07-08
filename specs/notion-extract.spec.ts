import { describe, it, expect } from "vitest";
import { extractTitle, extractSelectLike } from "@/services/notion";

describe("extractTitle", () => {
  it("명시적 키(Name)에서 제목 추출", () => {
    const props = { Name: { type: "title", title: [{ plain_text: "AI 포트폴리오" }] } };
    expect(extractTitle(props as never)).toBe("AI 포트폴리오");
  });

  it("독립 페이지의 소문자 'title' 속성도 추출 (버그 회귀 방지)", () => {
    // child page 의 제목 속성 키는 소문자 title — 예전엔 못 읽어 (untitled) 로 오분류됐음
    const props = { title: { type: "title", title: [{ plain_text: "이력서" }] } };
    expect(extractTitle(props as never)).toBe("이력서");
  });

  it("title 타입 속성 없으면 빈 문자열", () => {
    const props = { 상태: { type: "status", status: { name: "Done" } } };
    expect(extractTitle(props as never)).toBe("");
  });
});

describe("extractSelectLike", () => {
  it("select 타입", () => {
    const props = { 카테고리: { type: "select", select: { name: "업무" } } };
    expect(extractSelectLike(props as never, ["카테고리"])).toBe("업무");
  });

  it("status 타입", () => {
    const props = { 상태: { type: "status", status: { name: "In progress" } } };
    expect(extractSelectLike(props as never, ["상태"])).toBe("In progress");
  });

  it("multi_select 타입 → 첫 옵션명 (프로젝트 DB 카테고리, 버그 회귀 방지)", () => {
    const props = { 카테고리: { type: "multi_select", multi_select: [{ name: "자체프로젝트" }] } };
    expect(extractSelectLike(props as never, ["카테고리"])).toBe("자체프로젝트");
  });

  it("빈 multi_select → undefined", () => {
    const props = { 카테고리: { type: "multi_select", multi_select: [] } };
    expect(extractSelectLike(props as never, ["카테고리"])).toBeUndefined();
  });
});
