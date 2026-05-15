# Step 2: composer-redesign

## 읽어야 할 파일

- `/CLAUDE.md` — 다크 only, AI 슬롭 안티패턴 금지 (backdrop-filter blur, gradient text, glow shadow, blur-3xl orb, 보라/네온 색).
- `/docs/UI_GUIDE.md` — "Composer 외곽 박스 (FEAT-030)", "Composer textarea", "Composer 하단 액션 row".
- `/docs/RESPONSIVE.md` — "Composer (FEAT-030 prominent box)" 표 (외곽 padding, Send 사이즈, ModelSwitcher 라벨).
- `/docs/PAGES.md` — Composer 직상단에 Carousel, 좌하단 ModelSwitcher / 우하단 Send 와이어프레임.
- `/spec.json` — FEAT-021 (IME 3중 체크 강제), FEAT-030, TS-72 (`Composer prominent rounded-3xl box + inline action row`).
- `/components/chat/Composer.tsx` — 현재 단순 row 구조: textarea + Button.
- `/components/chat/ChatRoot.tsx` — Composer 호출 위치 (step 1 결과: layout 마지막 children).
- `/specs/composer.spec.tsx` — 기존 IME / 길이 카운터 spec.

## 작업

`components/chat/Composer.tsx` 를 ChatGPT/Claude 류 prominent 박스로 재설계.

### TDD 순서

1. `specs/composer.spec.tsx` 에 TS-72 케이스 추가 (실패).
2. `components/chat/Composer.tsx` 재설계 (통과).
3. 기존 IME / 길이 spec 회귀 확인.

### 시그니처 / API 변경

```tsx
"use client";
import { forwardRef, type ReactNode } from "react";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
  /** 좌하단 액션 row 에 렌더되는 인라인 children (예: ModelSwitcher). step 3 에서 ChatRoot 가 주입. */
  leftAction?: ReactNode;
}
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(props, ref) { ... });
```

### 시각 구조 (UI_GUIDE.md verbatim)

```tsx
<form
  className={cn(
    "rounded-3xl border border-neutral-700 bg-neutral-900/40",
    "px-3 py-2 md:px-4 md:py-3",
    "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
    "transition-colors",
    "focus-within:border-neutral-500 focus-within:bg-neutral-900/60",
    "pb-[env(safe-area-inset-bottom)]",
    className,
  )}
  onSubmit={(e) => { e.preventDefault(); submit(); }}
>
  <textarea
    ref={ref}
    className="w-full resize-none bg-transparent text-[15px] md:text-sm text-white placeholder:text-neutral-500 outline-none min-h-[24px] leading-relaxed"
    value={value}
    onChange={onChangeHandler}
    onCompositionStart={() => { isComposingRef.current = true; }}
    onCompositionEnd={() => { isComposingRef.current = false; }}
    onKeyDown={onKeyDown}
    placeholder={placeholder ?? "메시지를 입력하세요 — 김윤수에게 직접 물어보세요"}
    rows={1}
    disabled={disabled}
    aria-label="채팅 메시지 입력"
  />
  <div className="mt-2 flex items-center justify-between gap-2">
    <div className="min-w-0 flex items-center gap-2">{leftAction}</div>
    <div className="flex items-center gap-2">
      {remaining <= 100 && (
        <span className={cn("text-xs", remaining < 0 ? "text-red-400" : "text-neutral-500")}>{remaining}</span>
      )}
      <Button
        type="submit"
        size="icon"
        variant="default"
        className="size-8 md:size-9 rounded-full"
        disabled={disabled || value.trim().length === 0}
        aria-label="메시지 전송"
      >
        <Send className="size-4" />
      </Button>
    </div>
  </div>
</form>
```

- max-rows 동적 조정: 기존 자동 높이 로직 (scrollHeight → style.height) 보존. `max-h-[96px] md:max-h-[120px] lg:max-h-[144px]` 같은 클래스 + overflow-y-auto. 또는 useEffect 로 직접 height set.
- placeholder 변경: `"메시지를 입력하세요…"` → `"메시지를 입력하세요 — 김윤수에게 직접 물어보세요"`. spec.json 의 forms 명세 변경 X (spec 에는 chat composer placeholder 가 등록 안 됨).
- IME 3중 체크 (`isComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229`) 그대로 보존. Enter → submit, Shift+Enter → 줄바꿈, composing 중 Enter → 무시.

### `specs/composer.spec.tsx` 추가 케이스 (TS-72)

```tsx
describe("Composer prominent box (TS-72)", () => {
  it("외곽 form 에 rounded-3xl + border-neutral-700 + bg-neutral-900/40", () => {
    const { container } = render(<Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} />);
    const form = container.querySelector("form");
    expect(form?.className).toMatch(/rounded-3xl/);
    expect(form?.className).toMatch(/border-neutral-700/);
    expect(form?.className).toMatch(/bg-neutral-900\/40/);
  });

  it("Send 버튼: aria-label '메시지 전송' + rounded-full + size-8 md:size-9", () => {
    const { container } = render(<Composer value="hi" onChange={vi.fn()} onSubmit={vi.fn()} />);
    const send = container.querySelector('button[aria-label="메시지 전송"]');
    expect(send?.className).toMatch(/rounded-full/);
    expect(send?.className).toMatch(/size-8/);
  });

  it("leftAction children 렌더 (ModelSwitcher slot)", () => {
    const { getByTestId } = render(
      <Composer value="" onChange={vi.fn()} onSubmit={vi.fn()}
        leftAction={<div data-testid="ms">model</div>} />,
    );
    expect(getByTestId("ms")).toBeInTheDocument();
  });

  it("focus-within 시 border-neutral-500 (CSS rule 존재만 확인)", () => {
    const { container } = render(<Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} />);
    const form = container.querySelector("form");
    expect(form?.className).toMatch(/focus-within:border-neutral-500/);
  });

  it("placeholder default '메시지를 입력하세요 — 김윤수에게 직접 물어보세요'", () => {
    const { getByPlaceholderText } = render(<Composer value="" onChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(getByPlaceholderText(/김윤수에게 직접 물어보세요/)).toBeInTheDocument();
  });
});
```

기존 IME / 길이 / Shift+Enter / disabled spec 은 그대로 통과해야 함.

### ChatRoot 측 변경 (step 2 범위 안)

ChatRoot 가 Composer 를 호출할 때 새 prop `leftAction` 을 추가. **이 step 에서는 임시로 `null` 전달** — 실제 ModelSwitcher 주입은 step 3.

```tsx
<Composer
  ref={composerRef}
  value={input}
  onChange={setInput}
  onSubmit={handleSend}
  disabled={isLoading}
  leftAction={null}  // step 3 에서 ModelSwitcher 로 교체
/>
```

### 핵심 규칙 (위반 금지)

- **IME 3중 체크 변경 금지** (FEAT-021).
- **safe-area-inset-bottom 제거 금지** (iOS 가상키보드).
- **AI 슬롭 안티패턴 금지**: backdrop-filter blur, gradient text, glow shadow, blur-3xl orb, 보라/네온. `shadow-[0_0_0_1px_...]` 같은 hairline border 만 허용.
- **자동 높이 로직 제거 금지** — textarea scrollHeight 기반 높이 조정 보존.
- **forwardRef 변경 금지** — ChatRoot 가 ref.focus() 호출.
- **새 dependency 추가 금지** — lucide-react `Send` 만 사용 (이미 의존성).

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/composer.spec.tsx
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

## 검증 절차

1. AC 실행.
2. 체크:
   - Composer.tsx 의 외곽 form 클래스 list 가 UI_GUIDE.md 명세와 일치.
   - 신규 leftAction prop 동작 (step 3 위한 인터페이스).
   - IME / Shift+Enter / 길이 카운터 회귀 통과.
   - TS-72 케이스 5개 모두 통과.
3. `phases/8-chat-layout-revamp/index.json` step 2 갱신.

## 금지사항

- **ChatRoot 의 children 순서 변경 금지** (step 1 완료, 회귀 X).
- **ModelSwitcher 의 위치 / 스타일 변경 금지** (step 3 책임).
- **SuggestionCarousel 변경 금지.**
- **새 애니메이션 도입 금지** (UI_GUIDE.md whitelist 외).
- **inline style 사용 금지** (자동 높이 동적 값 제외).
