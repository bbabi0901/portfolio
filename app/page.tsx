import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";

import { ChatRoot } from "@/components/chat/ChatRoot";
import { loadSpec } from "@/lib/spec-loader";
import { listAvailableModelIds } from "@/lib/models-availability";
import { DEFAULT_MODEL_ID, type ModelId } from "@/lib/models";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

export const metadata: Metadata = {
  title: "대화",
  description: "AI에게 물어보는 김윤수의 커리어와 프로젝트.",
};

function loadSuggestions(spec: ReturnType<typeof loadSpec>): SuggestedQuestionMeta[] {
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

export default function HomePage() {
  const spec = loadSpec();
  const availableModels = listAvailableModelIds();
  const defaultModelId =
    (spec.models.find((m) => m.default)?.id as ModelId | undefined) ?? DEFAULT_MODEL_ID;
  const suggestions = loadSuggestions(spec);

  return (
    <main className="mx-auto h-[100dvh] max-w-3xl px-4 md:px-6 lg:px-8">
      <ChatRoot
        greeting={spec.greeting}
        suggestions={suggestions}
        availableModels={availableModels}
        defaultModelId={defaultModelId}
      />
    </main>
  );
}
