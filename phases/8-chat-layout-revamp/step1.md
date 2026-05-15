# Step 1: chat-layout-reorder

## 읽어야 할 파일

- `/CLAUDE.md` — 다크 only, AI 슬롭 안티패턴 금지.
- `/docs/PAGES.md` — `/` 채팅 와이어프레임 (FEAT-030 갱신본): MessageList → JumpToLatestButton → Carousel → Composer 순서.
- `/docs/UI_GUIDE.md` — Suggestion Carousel wrapper 클래스 (FEAT-030: `border-t border-neutral-900 py-3`).
- `/docs/RESPONSIVE.md` — Composer / Carousel breakpoint 표.
- `/spec.json` — FEAT-030, TS-71 (`ChatRoot children order: MessageList → JumpToLatest → Carousel → Composer`).
- `/components/chat/ChatRoot.tsx` — 현재 children 순서: Header → SuggestionCarousel wrapper → scroll-area(MessageList) → JumpToLatest wrapper → Composer.

## 작업

`components/chat/ChatRoot.tsx` 의 children 순서를 재배치. **이 step 은 layout 만** — Composer 디자인은 step 2 에서, ModelSwitcher 이동은 step 3 에서. ChatRoot 외 파일 변경 X.

### TDD 순서

1. `specs/chat-layout.spec.tsx` 작성 (실패).
2. `components/chat/ChatRoot.tsx` 의 JSX children 순서 재배치 (통과).

### 시그니처 / 변경 핵심

#### 1. `specs/chat-layout.spec.tsx` (TS-71)

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChatRoot } from "@/components/chat/ChatRoot";

describe("ChatRoot layout order (TS-71)", () => {
  it("renders children in order: Header → MessageList scroll-area → JumpToLatest area → SuggestionCarousel → Composer", () => {
    const { container } = render(
      <ChatRoot
        greeting={{ message: "hi", typingDelayMs: 0, wordIntervalMs: [10, 10], rememberDays: 30 }}
        suggestions={[{ id: "Q-001", category: "intro", text: "안녕", expectedSourceTitles: [] }]}
        availableModels={[]}
        defaultModelId={"gpt-4o-mini"}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    const children = Array.from(root.children) as HTMLElement[];
    // 0: header, 1: scroll-area (MessageList container), 2: JumpToLatest wrapper, 3: SuggestionCarousel wrapper, 4: Composer
    // 정확 셀렉터:
    expect(children[0].tagName).toBe("HEADER");
    // MessageList scroll area 는 flex-1 + overflow-y-auto
    expect(children[1].className).toMatch(/flex-1.*overflow-y-auto|overflow-y-auto.*flex-1/);
    // JumpToLatest wrapper 는 relative
    expect(children[2].className).toMatch(/relative/);
    // Carousel wrapper — border-t (이제 위쪽 경계)
    expect(children[3].className).toMatch(/border-t/);
    // Composer 는 form 태그
    expect(children[4].tagName).toBe("FORM");
  });

  it("SuggestionCarousel wrapper has border-t (top edge) not border-b", () => {
    const { container } = render(/* … */ as any);
    const wrapper = container.querySelector("[data-suggestion-wrapper]");
    expect(wrapper?.className).toContain("border-t");
    expect(wrapper?.className).not.toContain("border-b");
  });
});
```

#### 2. `components/chat/ChatRoot.tsx` 변경

기존:
```tsx
<div className="flex h-full flex-col">
  <header>...</header>
  <div className="border-b border-neutral-900 py-3">   {/* Carousel — TOP */}
    <SuggestionCarousel ... />
  </div>
  <div className="relative flex-1 overflow-y-auto py-4">
    <MessageList ... />
  </div>
  <div className="relative">
    <JumpToLatestButton ... />
  </div>
  <Composer ... />
</div>
```

신규:
```tsx
<div className="flex h-full flex-col">
  <header>...</header>
  <div className="relative flex-1 overflow-y-auto py-4">
    <MessageList ... />
  </div>
  <div className="relative">
    <JumpToLatestButton ... />
  </div>
  <div data-suggestion-wrapper className="border-t border-neutral-900 py-3">   {/* Carousel — BOTTOM (직상단 of Composer) */}
    <SuggestionCarousel ... />
  </div>
  <Composer ... />
</div>
```

- JumpToLatestButton 의 `-top-12 absolute` 는 MessageList scroll-area 의 우측 상단에 floating 인데, 이제 MessageList 아래 + Carousel 위 사이에 위치. 시각 위치는 그대로 유지. CSS 의 `-top-12` 가 wrapper 의 top-edge 기준이므로 wrapper 위치만 바뀌면 됨.
- `data-suggestion-wrapper` 속성 추가 (테스트 셀렉터용).
- 다른 로직 (sticky-to-bottom, clear conversation, useChat 등) 일체 변경 X.

### 핵심 규칙 (위반 금지)

- **Composer / ModelSwitcher / SuggestionCarousel 의 클래스 변경 금지** — children 순서만.
- **sticky-to-bottom 로직 (`stuckBottom` state + `useEffect`) 변경 금지**. FEAT-015 회귀 방지.
- **`-top-12` JumpToLatestButton 클래스 변경 금지** — 시각 위치 유지.
- **MessageList 의 padding 조정 시 `py-4` 만 유지** — Carousel 이 아래로 옮겨졌으므로 위쪽 padding 늘리지 마라.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/chat-layout.spec.tsx
npm run test         # 전체 회귀
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `specs/chat-layout.spec.tsx` 존재 + 통과.
   - ChatRoot.tsx 의 JSX children 순서가 Header → scroll-area → JumpToLatest → SuggestionCarousel(data-suggestion-wrapper) → Composer 순.
   - Carousel wrapper 클래스: `border-t` 만 (border-b 없음).
   - 기존 spec 들 (atoms, messages, composer, greeting, chat-root) 모두 회귀 통과.
3. `phases/8-chat-layout-revamp/index.json` step 1 갱신.

## 금지사항

- **Composer / ModelSwitcher / SuggestionCarousel / MessageList / JumpToLatestButton 컴포넌트 내부 변경 금지.** 이유: 각 단일 책임. 이 step 은 ChatRoot 의 orchestration 만.
- **새 컴포넌트 추가 금지.**
- **`useChat`, `useState`, `useEffect` 로직 변경 금지.**
- **a11y attribute (role="log", aria-live) 변경 금지.**
- **AI 슬롭 안티패턴 (backdrop-filter blur, glow, gradient) 추가 금지.**
