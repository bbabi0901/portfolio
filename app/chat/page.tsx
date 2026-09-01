import type { Metadata } from "next";

import { ChatRoot } from "@/components/chat/ChatRoot";
import { loadSpec } from "@/lib/spec-loader";
import { loadSuggestions } from "@/lib/suggestions-loader";
import { listAvailableModelIds } from "@/lib/models-availability";
import { DEFAULT_MODEL_ID, type ModelId } from "@/lib/models";

export const metadata: Metadata = {
  title: "대화",
  description: "김윤수에게 직접 물어보세요. 노션 기록 기반 답변.",
  alternates: { canonical: "/chat" },
};

export default function ChatPage() {
  const spec = loadSpec();
  const availableModels = listAvailableModelIds();
  const defaultModelId =
    (spec.models.find((m) => m.default)?.id as ModelId | undefined) ?? DEFAULT_MODEL_ID;
  const suggestions = loadSuggestions(spec);

  // 랜딩에서 넘어온 ?q= 질문은 ChatRoot 가 클라이언트에서 읽어 자동 전송 (FEAT-034).
  // (서버 searchParams 를 쓰면 페이지가 동적 렌더링으로 바뀌므로 정적 유지를 위해 클라이언트 처리)
  return (
    <main id="main-content" className="mx-auto h-[100dvh] max-w-3xl px-4 md:px-6 lg:px-8">
      <ChatRoot
        greeting={spec.greeting}
        suggestions={suggestions}
        availableModels={availableModels}
        defaultModelId={defaultModelId}
      />
    </main>
  );
}
