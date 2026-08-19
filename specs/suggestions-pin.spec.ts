import { describe, it, expect } from "vitest";
import { pinSignatureQuestion } from "@/lib/suggestions-loader";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

const q = (id: string): SuggestedQuestionMeta => ({
  id,
  category: "c",
  text: id,
  expectedSourceTitles: [],
});

// TS-101 (FEAT-042) — 차별점 질문(Q-022, 하네스·AWS 서사)을 캐러셀 상단 고정
describe("pinSignatureQuestion (TS-101)", () => {
  it("Q-022 를 맨 앞으로 이동, 나머지 순서 보존", () => {
    const out = pinSignatureQuestion([q("Q-001"), q("Q-005"), q("Q-022"), q("Q-030")]);
    expect(out.map((x) => x.id)).toEqual(["Q-022", "Q-001", "Q-005", "Q-030"]);
  });

  it("Q-022 가 없으면 원본 순서 그대로", () => {
    const out = pinSignatureQuestion([q("Q-001"), q("Q-002")]);
    expect(out.map((x) => x.id)).toEqual(["Q-001", "Q-002"]);
  });

  it("이미 맨 앞이면 불변", () => {
    const list = [q("Q-022"), q("Q-001")];
    expect(pinSignatureQuestion(list).map((x) => x.id)).toEqual(["Q-022", "Q-001"]);
  });
});
