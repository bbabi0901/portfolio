import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { loadSpec } from "@/lib/spec-loader";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

/**
 * 빌드 산출물 public/data/suggestions.json 에서 추천 질문을 읽고,
 * 없으면 spec.json 의 코어 질문으로 폴백한다. (/, /chat 공용)
 */
export function loadSuggestions(spec: ReturnType<typeof loadSpec>): SuggestedQuestionMeta[] {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "suggestions.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { suggestedQuestions?: SuggestedQuestionMeta[] };
    if (Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0) {
      return parsed.suggestedQuestions;
    }
  } catch {
    // fall through to spec
  }
  return spec.suggestedQuestions.map((q) => ({
    id: q.id,
    category: q.category,
    text: q.text,
    expectedSourceTitles: q.expectedSourceTitles,
  }));
}
