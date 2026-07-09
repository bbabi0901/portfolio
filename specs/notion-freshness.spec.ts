import { describe, it, expect } from "vitest";
import { compareFreshness } from "@/lib/notion-freshness";
import type { NotionPageRef } from "@/types/notion";

function ref(partial: Partial<NotionPageRef> & { id: string }): NotionPageRef {
  return {
    title: partial.id,
    url: `https://www.notion.so/${partial.id}`,
    isPublic: true,
    category: "",
    ...partial,
  } as NotionPageRef;
}

describe("compareFreshness", () => {
  const GENERATED_AT = "2026-07-08T18:11:22+09:00"; // = 2026-07-08T09:11:22Z

  it("모든 페이지가 generatedAt 이전 수정 → FRESH", () => {
    const refs = [
      ref({ id: "a", lastEditedTime: "2026-07-01T00:00:00.000Z" }),
      ref({ id: "b", lastEditedTime: "2026-07-08T09:00:00.000Z" }),
    ];
    const r = compareFreshness(refs, GENERATED_AT);
    expect(r.stale).toBe(false);
    expect(r.staleRefs).toHaveLength(0);
  });

  it("generatedAt 이후 수정된 페이지 → STALE + 해당 페이지 목록", () => {
    const refs = [
      ref({ id: "old", lastEditedTime: "2026-07-01T00:00:00.000Z" }),
      ref({ id: "edited", title: "이력서", lastEditedTime: "2026-07-09T04:00:00.000Z" }),
    ];
    const r = compareFreshness(refs, GENERATED_AT);
    expect(r.stale).toBe(true);
    expect(r.staleRefs.map((s) => s.id)).toEqual(["edited"]);
  });

  it("lastEditedTime 없는 ref 는 판단에서 제외", () => {
    const refs = [ref({ id: "no-ts" })];
    const r = compareFreshness(refs, GENERATED_AT);
    expect(r.stale).toBe(false);
  });

  it("generatedAt 파싱 불가 → 안전하게 STALE 취급", () => {
    const refs = [ref({ id: "a", lastEditedTime: "2026-07-01T00:00:00.000Z" })];
    const r = compareFreshness(refs, "not-a-date");
    expect(r.stale).toBe(true);
  });

  it("KST 오프셋 경계 — generatedAt 직후 1초 수정도 STALE", () => {
    const refs = [ref({ id: "a", lastEditedTime: "2026-07-08T09:11:23.000Z" })];
    const r = compareFreshness(refs, GENERATED_AT);
    expect(r.stale).toBe(true);
  });
});
