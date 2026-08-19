import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { loadSpec } from "@/lib/spec-loader";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

/**
 * 빌드 산출물 public/data/suggestions.json 에서 추천 질문을 읽고,
 * 없으면 spec.json 의 코어 질문으로 폴백한다. (/, /chat 공용)
 */
/** 차별점 질문(하네스·AWS 서사, Q-022)을 캐러셀 상단 고정 (FEAT-042/TS-101) */
export function pinSignatureQuestion(
  list: SuggestedQuestionMeta[],
  id = "Q-022",
): SuggestedQuestionMeta[] {
  const idx = list.findIndex((q) => q.id === id);
  if (idx <= 0) return list;
  return [list[idx]!, ...list.slice(0, idx), ...list.slice(idx + 1)];
}

export function loadSuggestions(spec: ReturnType<typeof loadSpec>): SuggestedQuestionMeta[] {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "suggestions.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { suggestedQuestions?: SuggestedQuestionMeta[] };
    if (Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0) {
      return pinSignatureQuestion(parsed.suggestedQuestions);
    }
  } catch {
    // fall through to spec
  }
  return pinSignatureQuestion(
    spec.suggestedQuestions.map((q) => ({
      id: q.id,
      category: q.category,
      text: q.text,
      expectedSourceTitles: q.expectedSourceTitles,
    })),
  );
}
