import { describe, it, expect } from "vitest";
import { extractTitle, extractSelectLike, stripVolatileUrlParams } from "@/services/notion";

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

describe("stripVolatileUrlParams (임베딩 캐시 안정화)", () => {
  it("S3 서명 쿼리(X-Amz-*)를 제거해 텍스트를 결정적으로 만든다", () => {
    const md =
      "![img](https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b/photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123)\n본문";
    const out = stripVolatileUrlParams(md);
    expect(out).toContain("photo.jpg)");
    expect(out).not.toContain("X-Amz");
    // 같은 URL 에 다른 서명 → 동일 결과
    const md2 = md.replace("abc123", "zzz999");
    expect(stripVolatileUrlParams(md2)).toBe(out);
  });

  it("서명 없는 일반 URL 은 그대로 둔다", () => {
    const md = "[링크](https://example.com/page?tab=1) 텍스트";
    expect(stripVolatileUrlParams(md)).toBe(md);
  });
});
