# Step 4: chat-root

## 읽어야 할 파일

- `/CLAUDE.md` — 클라이언트는 `/api/*` 만 호출. localStorage 모델 저장.
- `/docs/UI_GUIDE.md` § 8.10 sticky-to-bottom 정책, § 8.11 폰트/safe area, § 8.12 푸터.
- `/docs/PAGES.md` — `/` 채팅 페이지 와이어프레임.
- `/docs/TEST_SCENARIOS.md` — TS-01~22 (채팅 시나리오), TS-66 (라우트 왕복 + greeted 유지).
- `/spec.json` — `features[]` 의 FEAT-001/002/003/004/014/015/016/017, `greeting` 객체.
- 이전 step 의 모든 컴포넌트:
  - `components/chat/Composer.tsx`
  - `components/chat/MessageList.tsx` + `MessageBubble.tsx`
  - `components/chat/SuggestionCarousel.tsx`
  - `components/chat/ModelSwitcher.tsx`
  - `components/chat/JumpToLatestButton.tsx`
  - `components/chat/GreetingPlayer.tsx`
  - `components/chat/MessageActionsBar.tsx`
  - `components/chat/FeedbackButtons.tsx` + Popover
- `/lib/spec-loader.ts` — server-only. 이 step 에서 server component (page.tsx) 가 spec 읽고 ChatRoot client 에 prop 으로 주입.
- `/lib/models.ts` — listAvailableModels, DEFAULT_MODEL_ID.
- `/types/chat.ts`, `/types/portfolio.ts`.

## 작업

`ChatRoot.tsx` — 모든 chat 컴포넌트를 합쳐 `/` 페이지에 렌더할 client orchestrator. `app/page.tsx` 를 server-side 로 만들고 ChatRoot 를 mount.

### TDD 순서

1. `specs/components/chat-root.spec.tsx` 작성 (실패).
2. `components/chat/ChatRoot.tsx`, `app/page.tsx` 교체 (통과).

### 시그니처

```tsx
"use client";
import type { Question } from "@/types/portfolio";
import type { GreetingConfig } from "./GreetingPlayer";
import type { ModelId } from "./ModelSwitcher";

export interface ChatRootProps {
  greeting: GreetingConfig;
  suggestions: Question[];
  availableModels: ModelId[];
  defaultModelId: ModelId;
  className?: string;
}
export function ChatRoot(props: ChatRootProps): JSX.Element;
```

### `app/page.tsx` (server component)

```tsx
import { loadSpec } from "@/lib/spec-loader";
import { listAvailableModelIds } from "@/lib/models-availability";   // server helper (env 기반)
import { ChatRoot } from "@/components/chat/ChatRoot";
import suggestionsJson from "@/public/data/suggestions.json";   // 빌드 산출물
// — 또는 fs 로 읽기. import 가 깔끔하고 Edge runtime 무관 (page 는 RSC default).

export default function HomePage() {
  const spec = loadSpec();
  const available = listAvailableModelIds();
  return (
    <main className="mx-auto flex h-[100dvh] max-w-3xl flex-col px-4 md:px-6 lg:px-8">
      <ChatRoot
        greeting={spec.greeting}
        suggestions={suggestionsJson.questions ?? spec.suggestedQuestions}
        availableModels={available}
        defaultModelId={spec.models.find(m => m.default)?.id ?? "gpt-4o-mini"}
      />
    </main>
  );
}
```

- `lib/models-availability.ts` 를 신규 생성 (env 기반으로 노출 가능 모델 ID 배열 반환). server-only. `lib/models.ts` 의 `listAvailableModels` 는 이미 비슷한 역할이지만 ModelSpec 반환 → 여기는 ID 만 필요.
- `suggestions.json` 이 없는 환경 (build skip) 도 있으니 try/catch + fallback to spec.suggestedQuestions.

### ChatRoot 핵심 로직

#### 1. `useChat` (Vercel AI SDK)

```tsx
import { useChat } from "@ai-sdk/react";

const [modelId, setModelId] = useState<ModelId>(/* localStorage 또는 defaultModelId */);

const { messages, append, isLoading, stop, setMessages } = useChat({
  api: "/api/chat",
  body: { modelId },
  /* 응답 헤더에서 X-Model-Substitution / X-Retrieval-Mode 확인 가능 (onResponse) */
  onResponse(res) {
    if (res.headers.get("X-Model-Substitution") === "true") {
      toast.warning("이 모델은 일시적으로 사용 불가. 기본 모델로 대체했어요.");
    }
  },
  onError(err) {
    /* ERR-01~05 매핑 토스트 */
  },
});
```

- `useChat` 의 messages 는 vercel/ai 의 `Message` 타입. 우리 `ChatMessage` 와 다르므로 mapping helper 필요.
- greeting message 는 useChat 의 messages 에 포함시키지 마라 (LLM context 누출). 별도 state 로 보유.

#### 2. greeting 통합

```tsx
const [greetingMsg, setGreetingMsg] = useState<ChatMessage | null>(null);
const [fastForwardSignal, setFastForwardSignal] = useState(0);

function handleSend(text: string) {
  setFastForwardSignal((n) => n + 1);
  append({ role: "user", content: text });
}

// 메시지 표시: greetingMsg 먼저, useChat.messages 그 다음.
const allMessages: ChatMessage[] = useMemo(() => {
  const from = greetingMsg ? [greetingMsg] : [];
  return [...from, ...mapChatMessages(messages)];
}, [greetingMsg, messages]);
```

#### 3. localStorage 모델 저장

```ts
const STORAGE_KEY = "portfolio.model";
useEffect(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && availableModels.includes(raw as ModelId)) setModelId(raw as ModelId);
  } catch { /* memory fallback already in state */ }
}, []);
useEffect(() => {
  try { localStorage.setItem(STORAGE_KEY, modelId); } catch {}
}, [modelId]);
```

#### 4. Sticky-to-bottom + JumpToLatest (FEAT-015)

```tsx
const scrollRef = useRef<HTMLDivElement>(null);
const [stuckBottom, setStuckBottom] = useState(true);

useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;
  const onScroll = () => {
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStuckBottom(distance < 100);
  };
  el.addEventListener("scroll", onScroll, { passive: true });
  return () => el.removeEventListener("scroll", onScroll);
}, []);

useEffect(() => {
  if (!stuckBottom) return;
  const el = scrollRef.current;
  if (!el) return;
  // throttle 100ms
  const t = setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0);
  return () => clearTimeout(t);
}, [allMessages, stuckBottom]);

function jumpToBottom() {
  const el = scrollRef.current;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
}
```

- visualViewport API 보정: 모바일 가상 키보드 등장 시 `window.visualViewport.height` 변경. body 패딩 또는 ChatRoot height 조정. 단순화: `h-[100dvh]` 만 사용 (max-h 대신).

#### 5. Clear conversation (FEAT-017)

```tsx
function clearConversation() {
  if (isLoading) stop();
  setMessages([]);              // useChat reset
  // greeting 은 그대로 유지 (사용자가 명시: 한 번만 인사).
}
```

- 헤더의 "새 대화" 버튼 + Cmd/Ctrl+K 단축키 (`useEffect` + `keydown` listener).
- Confirm popover: shadcn Popover 또는 단순 confirm. 표준화 위해 shadcn Popover 권장.

#### 6. 추천 질문 클릭 → 즉시 전송

```tsx
const [visited, setVisited] = useState<Set<string>>(new Set());

function handleSuggestion(q: Question) {
  setVisited((s) => new Set(s).add(q.id));
  handleSend(q.text);
}
```

#### 7. ErrorState

```tsx
{error && <ErrorState message={mapError(error)} onRetry={retryLast} />}
```

- `components/chat/ErrorState.tsx` 신규. red-400 indicator + "다시 시도" button. props (message, onRetry).

### 레이아웃

```tsx
<div className="flex h-full flex-col">
  <header className="flex items-center justify-between py-3">
    <h1 className="text-sm text-neutral-400">김윤수 — AI Portfolio</h1>
    <div className="flex items-center gap-2">
      <ModelSwitcher value={modelId} onChange={setModelId} available={availableModels} />
      <ClearButton onClick={clearConfirm} />
    </div>
  </header>

  <SuggestionCarousel
    questions={suggestions}
    visitedIds={visited}
    onSelect={handleSuggestion}
  />

  <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
    <MessageList messages={allMessages} onCopy={...} onFeedback={...} onOpenSource={...} emptyState={<EmptyState />} />
    {!greetingMsg && <GreetingPlayer config={greeting} onComplete={setGreetingMsg} fastForwardSignal={fastForwardSignal} />}
  </div>

  <JumpToLatestButton visible={!stuckBottom} onClick={jumpToBottom} className="absolute right-4 bottom-24" />

  <Composer
    value={input}
    onChange={setInput}
    onSubmit={handleSend}
    disabled={isLoading}
  />
</div>
```

- `EmptyState`, `ErrorState` 신규 컴포넌트. 단순. UI_GUIDE.md 의 톤.

### Specs (TDD red)

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { rest, http, HttpResponse } from "msw";
import { server } from "@/tests/msw/server";

describe("ChatRoot", () => {
  beforeEach(() => {
    localStorage.clear();
    server.use(
      http.post("/api/chat", async () => {
        return new HttpResponse(/* SSE mock */);
      }),
    );
  });

  it("초기 진입: GreetingPlayer 시뮬레이션 + composer focus 유도", async () => { /* … */ });

  it("ModelSwitcher 변경 → localStorage 저장", () => { /* … */ });

  it("페이지 로드 시 localStorage 의 모델 ID 복원", () => { /* … */ });

  it("추천 질문 badge 클릭 → 즉시 사용자 메시지 추가 + /api/chat 호출", async () => { /* … */ });

  it("응답 도중 사용자 새 질문 → in-flight abort + 새 요청", async () => { /* useChat.stop → append */ });

  it("clear conversation → messages 0 + greeting 유지", () => { /* … */ });

  it("Cmd+K 단축키 → clear confirm popover", () => { /* … */ });

  it("sticky-to-bottom: distance < 100 → 자동 scroll", () => { /* … */ });

  it("sticky 해제: 위로 스크롤 → JumpToLatest 노출", () => { /* … */ });

  it("X-Model-Substitution 헤더 시 toast 발생", async () => { /* … */ });

  it("503 (no models) → ErrorState 표시", async () => { /* … */ });

  it("rate limit 429 → ErrorState + Retry-After 카운트다운 (단순 표시)", async () => { /* … */ });

  it("availableModels=[] 시 ModelSwitcher disabled + 채팅 disabled", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **GreetingPlayer 의 메시지를 useChat.messages 에 합치지 마라.** 이유: LLM context 누출.
- **AI SDK `useChat` 의 fetch 옵션 외 직접 fetch 금지.** 이유: 표준 흐름 유지.
- **localStorage 사용은 try/catch.** Safari private mode / 차단 환경 fallback.
- **API 키, model 토큰 관련 정보 클라이언트 노출 금지.** 응답 헤더 외 body 의 secret 누설 X.
- **toast 라이브러리는 sonner (shadcn-installed) 만.** 커스텀 toast 금지.
- **scroll 자동 동작은 throttle 100ms.** 이유: 매 토큰마다 setScroll 시 jank.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

수동 dev 서버 검증:
```bash
npm run dev &
sleep 5
curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000   # 200
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `components/chat/ChatRoot.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `ClearButton.tsx` (또는 ChatRoot 내 inline).
   - `app/page.tsx` 가 ChatRoot 를 mount (placeholder 텍스트 제거).
   - `lib/models-availability.ts` (server-only env helper).
   - 모든 spec 통과.
   - `npm run build` 성공.
3. `phases/3-chat-ui/index.json` step 4 갱신 (이 task 의 마지막 step).

## 금지사항

- **`/api/feedback` 호출 금지.** 이유: 후속 task `5-feedback-contact-api`. UI 만 노출, callback 으로 부모(향후 task)에 전파.
- **`window.opener` 사용 금지.** 이유: 보안 (외부 link 항상 noopener).
- **service worker 등록 금지.** 이유: PWA 는 후속 task.
- **react-hook-form 사용 금지** (이 step). 이유: composer 는 controlled state 만으로 충분, contact form 은 후속 task.
- **emotion / styled-components 추가 금지.** Tailwind only.
- **AI SDK 의 useCompletion 사용 금지.** 이유: messages array 패턴이 더 명확.
- **인증/세션 코드 추가 금지.** stateless chat (ADR-009).
