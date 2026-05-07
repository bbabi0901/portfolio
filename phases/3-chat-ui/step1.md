# Step 1: messages

## 읽어야 할 파일

- `/CLAUDE.md` — 다크 only, AI 슬롭 안티패턴 금지.
- `/docs/UI_GUIDE.md` — MessageBubble 색 (사용자: 우측 neutral-100 bg, 어시스턴트: 좌측 transparent + neutral-300), 출처 인용 chip.
- `/docs/AI_CONTRACT.md` — 응답 마크다운 + 출처 링크 형식.
- `/docs/PAGES.md` — 메시지 액션 바 (Copy / Regenerate / Other-model / Open source).
- `/spec.json` — `features[]` 의 FEAT-002 (typing indicator), FEAT-004 (Feedback 👍/👎), FEAT-016 (Message Actions).
- `/components/chat/TypingDots.tsx` — 이전 step (step 0).
- `/components/ui/popover.tsx`, `radio-group.tsx`, `card.tsx` — shadcn.
- `/types/portfolio.ts` — Chunk type (sourceTitle, sourceUrl 인용용).
- `/lib/output-filter.ts` — 이전 task. 응답 후처리는 server side. UI 는 마크다운 렌더만.

## 작업

메시지 표시 컴포넌트 + 액션 바 + 피드백 popover. TDD.

### TDD 순서

1. `specs/components/messages.spec.tsx` 작성 (실패).
2. 컴포넌트 구현 (통과).

### 생성할 파일

#### 1. `types/chat.ts` (UI 측 메시지 타입)

```ts
export type MessageRole = "user" | "assistant" | "greeting";
export type MessageStatus = "idle" | "typing" | "streaming" | "done" | "error";

export interface Citation {
  sourceTitle: string;
  sourceUrl: string | null;   // 비공개 노션 페이지면 null → click disabled
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;            // 누적된 마크다운
  status: MessageStatus;
  citations?: Citation[];
  createdAt: number;          // epoch ms
  feedbackSent?: boolean;     // 한 번 제출 후 toggle disable
}
```

#### 2. `components/chat/MessageBubble.tsx`

```tsx
"use client";
import type { ChatMessage } from "@/types/chat";

export interface MessageBubbleProps {
  message: ChatMessage;
  onFeedback?: (messageId: string, kind: "up" | "down") => void;
  onCopy?: (messageId: string) => void;
  onOpenSource?: (citation: Citation) => void;
  className?: string;
}
export function MessageBubble(props: MessageBubbleProps): JSX.Element;
```

- 사용자 메시지 (`role === "user"`): 우측 정렬, `bg-neutral-100 text-neutral-900 rounded-2xl rounded-br-md`, `max-w-[85%] md:max-w-[75%]`.
- 어시스턴트/greeting (`role === "assistant" | "greeting"`): 좌측 정렬, `text-neutral-300 prose prose-invert prose-sm`, max-w 동일.
- `status === "typing"` → `<TypingDots />` 만 표시 (텍스트 0).
- `status === "streaming"` → 본문 + 끝에 cursor blink (`animate-pulse | <span className="inline-block w-1 h-4 bg-current animate-pulse">|</span>`).
- `status === "done"` → 본문만. citations 가 있으면 footer 에 chips.
- `status === "error"` → 빨간 인디케이터 + "다시 시도" 버튼은 ErrorState (별도 컴포넌트, 이 step 외).
- 마크다운 렌더: `react-markdown` + `remark-gfm` + `rehype-highlight`. 이 step 에서 의존성 추가 필요 (없으면 `npm install react-markdown remark-gfm rehype-highlight`).
- 코드블록: `bg-zinc-950 text-zinc-200 px-3 py-2 rounded-lg`. 언어 라벨 작게.
- **외부 link target=_blank + rel=noopener noreferrer**.

#### 3. `components/chat/MessageList.tsx`

```tsx
"use client";
import type { ChatMessage } from "@/types/chat";

export interface MessageListProps {
  messages: ChatMessage[];
  onFeedback?: (messageId: string, kind: "up" | "down") => void;
  onCopy?: (messageId: string) => void;
  onOpenSource?: (citation: Citation) => void;
  className?: string;
  emptyState?: React.ReactNode;
}
export function MessageList(props: MessageListProps): JSX.Element;
```

- `<div role="log" aria-live="polite" className="flex flex-col gap-4">`.
- 메시지 0개 + emptyState 제공 시 emptyState 렌더.
- 각 메시지 → `<MessageBubble />`.
- key = `message.id`.
- 자동 스크롤 정책은 **부모 (ChatRoot, step 4)** 책임. 이 컴포넌트는 그냥 list.

#### 4. `components/chat/MessageActionsBar.tsx`

```tsx
"use client";
export interface MessageActionsBarProps {
  messageId: string;
  text: string;                      // 복사 대상
  citations: Citation[];
  onCopy: () => void;
  onOpenSource: (citation: Citation) => void;
  onFeedback: (kind: "up" | "down") => void;
  className?: string;
}
export function MessageActionsBar(props: MessageActionsBarProps): JSX.Element;
```

- 작은 button 들: Copy (lucide `Copy`), 출처 chips (`Link`), 👍 (`ThumbsUp`), 👎 (`ThumbsDown`).
- Copy 클릭: `navigator.clipboard.writeText(text)` 시도 → 실패 시 `document.execCommand("copy")` fallback → 그것도 실패 시 toast 메시지 (toast 호출은 부모 책임, 이 컴포넌트는 결과 prop callback 으로 알림).
- `await navigator.clipboard.writeText` → Promise. 0.8s "복사됨" 표시 후 원복 (local state).
- aria-label 모든 버튼에.

#### 5. `components/chat/FeedbackButtons.tsx` + `FeedbackPopover.tsx`

```tsx
// FeedbackButtons.tsx (얇은 wrapper, 👍 + 👎)
"use client";
export interface FeedbackButtonsProps {
  messageId: string;
  alreadySent: boolean;          // 이전에 제출됨 → 버튼 disable
  onUp: () => void;
  onDownStart: () => void;        // 👎 누르면 popover 열기 (부모 제어)
}
export function FeedbackButtons(props: FeedbackButtonsProps): JSX.Element;

// FeedbackPopover.tsx (👎 reason 선택)
"use client";
export type FeedbackReason =
  | "inaccurate" | "off-topic" | "incomplete" | "other";
export interface FeedbackPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: FeedbackReason, detail?: string) => void;
  trigger: React.ReactNode;
}
export function FeedbackPopover(props: FeedbackPopoverProps): JSX.Element;
```

- 4 reason 옵션 (radio-group):
  - `inaccurate`: "정보가 정확하지 않아요"
  - `off-topic`: "내가 원한 답이 아니에요"
  - `incomplete`: "관련 내용이 부족해요"
  - `other`: "기타 (직접 입력)"
- `other` 선택 시 textarea (1~500자) 노출.
- 제출 → `onSubmit(reason, detail)` 호출 + popover close.
- 백엔드 호출은 부모 책임 (이 컴포넌트는 controlled).
- aria-labelledby, aria-describedby 권장.

#### 6. `components/chat/SourceCitation.tsx`

```tsx
"use client";
import type { Citation } from "@/types/chat";

export interface SourceCitationProps {
  citation: Citation;
  index: number;             // 1-based
  onClick: (citation: Citation) => void;
}
export function SourceCitation(props: SourceCitationProps): JSX.Element;
```

- chip 모양 (`rounded-full border border-neutral-700 px-2 py-0.5 text-xs`).
- `<sup>` 위치: MessageBubble 본문 아래 footer 영역.
- `sourceUrl === null` → disabled + tooltip "이 출처는 비공개입니다" (shadcn tooltip 또는 title attribute).
- `sourceUrl` 정상 → `onClick(citation)` 호출 (부모가 `window.open(url, "_blank", "noopener,noreferrer")`).

### Specs (TDD red)

`specs/components/messages.spec.tsx`:

```tsx
describe("MessageBubble", () => {
  it("user 메시지 우측 정렬 클래스", () => { /* … */ });
  it("assistant 마크다운 렌더 + prose-invert", () => { /* … */ });
  it("status='typing' 시 TypingDots 만 표시 (text 0)", () => { /* … */ });
  it("status='streaming' 시 본문 + cursor blink", () => { /* … */ });
  it("citations 있으면 footer 에 SourceCitation chips", () => { /* … */ });
  it("외부 link target=_blank rel=noopener noreferrer", () => { /* … */ });
});

describe("MessageList", () => {
  it("role='log' aria-live='polite'", () => { /* … */ });
  it("메시지 0 + emptyState → emptyState 렌더", () => { /* … */ });
  it("각 메시지 MessageBubble 렌더, key=id", () => { /* … */ });
});

describe("MessageActionsBar", () => {
  it("Copy 버튼 클릭 → onCopy 호출", () => { /* … */ });
  it("clipboard mock: writeText 호출", async () => { /* … */ });
  it("clipboard 실패 시 fallback 시도", async () => { /* … */ });
});

describe("FeedbackButtons + Popover", () => {
  it("alreadySent=true → 두 버튼 disabled", () => { /* … */ });
  it("👎 클릭 → onDownStart 호출 (popover 열기)", () => { /* … */ });
  it("popover reason 'other' 선택 → textarea 노출", () => { /* … */ });
  it("제출 → onSubmit(reason, detail) 호출 + popover close", () => { /* … */ });
});

describe("SourceCitation", () => {
  it("sourceUrl=null → disabled + title='비공개'", () => { /* … */ });
  it("sourceUrl 정상 → click → onClick(citation)", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **`"use client"` 필수.**
- **MessageBubble 의 markdown 렌더에 raw HTML 허용 금지** (`rehype-raw` 사용 X). 이유: XSS surface.
- **외부 link 항상 `target=_blank rel=noopener noreferrer`.**
- **citations 의 sourceUrl 외 URL 을 chip 으로 만들지 마라** (이미 server output-filter 가 마스킹).
- **clipboard 권한 거부 시 silent 실패 금지**. 부모에 알림 (callback 또는 throw).
- **Feedback 백엔드 호출 금지** (이 step). controlled callback 만.

## Acceptance Criteria

```bash
npm install react-markdown remark-gfm rehype-highlight
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
```

## 검증 절차

1. AC 실행.
2. 체크:
   - 6 컴포넌트 + 1 type 파일 + spec 파일 존재.
   - 모든 spec 통과.
   - `grep -nE "rehype-raw|dangerouslySetInnerHTML" components/chat/` → 0건.
   - `grep -nE "target=\"_blank\"" components/chat/MessageBubble.tsx` → 모든 외부 link 매칭.
3. `phases/3-chat-ui/index.json` step 1 갱신.

## 금지사항

- **`fetch("/api/feedback")` 호출 금지.** 이유: 이 step 은 UI 만, 백엔드 호출은 후속 task `5-feedback-contact-api`.
- **`fetch("/api/chat")` 호출 금지.** 이유: 후속 step `chat-root` 의 책임.
- **GreetingPlayer 와 합치지 마라.** 이유: 후속 step `greeting` 분리 책임.
- **마크다운에 mermaid/실시간 codeexec 도입 금지.** 이유: MVP 외.
- **react-markdown plugin 에 rehype-raw 추가 금지.** 이유: XSS.
- **shadcn `Toast` 직접 호출 금지** (이 step). 토스트는 부모 책임 (sonner).
