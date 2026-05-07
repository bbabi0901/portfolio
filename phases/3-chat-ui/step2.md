# Step 2: composer

## 읽어야 할 파일

- `/CLAUDE.md` — 한국어 IME 처리, 입력 길이 500자 제한.
- `/docs/UI_GUIDE.md` — Composer 클래스 명세, mobile safe area `pb-[env(safe-area-inset-bottom)]`.
- `/docs/PAGES.md` — Composer 위치 (페이지 하단 sticky).
- `/spec.json` — `features[]` 의 FEAT-021 (IME / Composer 디테일).
- `/components/ui/textarea.tsx`, `button.tsx` — shadcn.

## 작업

`Composer.tsx` — 입력 textarea + 전송 버튼 + IME 처리 + 길이 카운터 + 자동 높이.

### TDD 순서

1. `specs/components/composer.spec.tsx` 작성 (실패).
2. `components/chat/Composer.tsx` 구현 (통과).

### 시그니처

```tsx
"use client";
export interface ComposerProps {
  /** 부모가 제어. 빈 문자열로 초기화. */
  value: string;
  onChange: (value: string) => void;
  /** Enter 또는 전송 버튼 클릭. value trim 후 1자 이상이어야 호출. */
  onSubmit: (text: string) => void;
  /** 외부 비활성화 — in-flight 응답 중 또는 quota 초과 등. 단 keystroke 는 허용 (대기 가능). */
  disabled?: boolean;
  /** placeholder 기본 "메시지를 입력하세요…" */
  placeholder?: string;
  /** max 글자수, 기본 500. spec.json 의 messages[].content z.max 와 일치. */
  maxLength?: number;
  /** 모바일 max-rows=4, 데스크톱 6. matchMedia 로 반응형. */
  className?: string;
  autoFocus?: boolean;
}
export function Composer(props: ComposerProps): JSX.Element;
```

### 핵심 동작

#### 1. IME 3중 체크 (Enter 처리)

```tsx
const isComposingRef = useRef(false);

function onCompositionStart() { isComposingRef.current = true; }
function onCompositionEnd() { isComposingRef.current = false; }

function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Enter") return;
  if (e.shiftKey) return;       // Shift+Enter → 줄바꿈 (default)
  // 3중 체크: composition 중인지
  const composing =
    isComposingRef.current ||
    (e.nativeEvent as KeyboardEvent).isComposing ||
    e.keyCode === 229;
  if (composing) return;
  e.preventDefault();
  submit();
}
```

이 패턴은 한글 IME 가 Enter 를 confirm 으로 보내는 macOS Safari, Chrome, iOS 등에서 의도치 않은 전송을 방지. `keyCode 229` 도 deprecated 이지만 일부 안드로이드 환경에서 isComposing 미설정.

#### 2. 자동 높이 (auto-grow textarea)

```tsx
const ref = useRef<HTMLTextAreaElement>(null);
useEffect(() => {
  const el = ref.current;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
}, [value]);
```
- `MAX_HEIGHT_PX`: 모바일 `4 * lineHeight + padding`, 데스크톱 `6 * lineHeight`. 단순화: 모바일 96px, 데스크톱 144px (line-height 1.5 + 14/15px font).
- min-height = 1 line.
- overflow-y: auto.

#### 3. 길이 카운터

```tsx
const remaining = maxLength - value.length;
// remaining <= 100 일 때만 카운터 노출
{remaining <= 100 && (
  <span className={cn("text-xs", remaining < 0 ? "text-red-400" : "text-neutral-500")}>
    {remaining}
  </span>
)}
```
- 길이 초과 시 onChange 자체는 허용하되 onSubmit 시 `value.slice(0, maxLength)` 로 잘림 + 부모에 toast 알림 (callback 없이 그냥 잘림 처리).
- 붙여넣기 (paste) 도 동일 — onPaste 에서 잘라내기 시도하지 마라. onChange 에서 자르기.

#### 4. 전송 버튼

- 우측 끝, `<Button size="icon" variant="ghost">` + lucide `Send` 아이콘.
- `value.trim().length === 0 || disabled` → button disabled.
- 클릭 → submit().

#### 5. submit 함수

```tsx
function submit() {
  const text = value.trim().slice(0, maxLength);
  if (text.length === 0) return;
  onSubmit(text);
  onChange("");        // 부모에 빈 문자열로 reset 위임
}
```

#### 6. autoFocus + safe area

```tsx
<form className={cn("flex items-end gap-2 p-3 border-t border-neutral-800 bg-[#0a0a0a]/95 backdrop-blur-0 pb-[env(safe-area-inset-bottom)]", className)} onSubmit={(e) => { e.preventDefault(); submit(); }}>
  <Textarea ref={ref} ... />
  <Button type="submit" ... ><Send /></Button>
</form>
```

- `bg-[#0a0a0a]/95` 의 약간 투명 + scroll 시 underlying message 살짝 비침.
- backdrop-filter 금지 (CLAUDE.md AI 슬롭). bg only.
- 모바일 가상 키보드 visual viewport 보정은 부모(ChatRoot) 책임. 이 컴포넌트는 sticky 안에서 정상 렌더.

### Specs (TDD red)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("Composer", () => {
  it("Enter → onSubmit(value) + value reset", async () => {
    const onSubmit = vi.fn(), onChange = vi.fn();
    render(<Composer value="hi" onChange={onChange} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("hi");
    expect(onChange).toHaveBeenCalledWith("");
  });
  it("Shift+Enter → 줄바꿈, onSubmit 미호출", async () => { /* … */ });
  it("IME composing 중 Enter → onSubmit 미호출 (compositionstart 후)", () => {
    const onSubmit = vi.fn();
    render(<Composer value="안녕" onChange={vi.fn()} onSubmit={onSubmit} />);
    const ta = screen.getByRole("textbox");
    fireEvent.compositionStart(ta);
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("nativeEvent.isComposing=true → onSubmit 미호출", () => {
    /* keyDown event with nativeEvent.isComposing */
  });
  it("keyCode=229 (legacy) → onSubmit 미호출", () => { /* … */ });
  it("composition end 후 Enter → onSubmit 정상 호출", () => { /* … */ });
  it("빈 입력 (trim 후 0) Enter → onSubmit 미호출", () => { /* … */ });
  it("disabled=true → Enter 와 button 모두 동작 안 함", () => { /* … */ });
  it("길이 카운터: remaining <= 100 일 때만 표시", () => { /* … */ });
  it("maxLength 초과 paste → value 잘림", async () => { /* … */ });
  it("자동 높이: scrollHeight 변경 → style.height 갱신", () => { /* … */ });
  it("safe area padding 적용 (style 또는 class)", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **IME 3중 체크 모두 구현.** 이유: Android/iOS/macOS 환경 차이로 단일 체크는 false negative.
- **onChange 에서 length cap 적용.** paste handler 에서 별도 처리 X (이중 처리 시 race).
- **disabled 상태에서 keystroke 자체는 막지 마라** (사용자가 미리 작성 가능). submit 만 차단.
- **autoFocus 는 부모 prop 으로만**. mount 시 무조건 focus 금지 (페이지 진입 시 사용자 시야 빼앗김).
- **ref forwarding 필요 시 React.forwardRef 사용.** ChatRoot 가 textarea 에 직접 focus() 호출할 수 있어야.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `components/chat/Composer.tsx`, `specs/components/composer.spec.tsx` 존재.
   - 모든 spec 통과 (특히 IME 3중 체크 3개).
   - `grep -nE "isComposing|compositionStart|compositionEnd|keyCode" components/chat/Composer.tsx` → 모두 매칭.
   - safe-area-inset-bottom 적용.
3. `phases/3-chat-ui/index.json` step 2 갱신.

## 금지사항

- **contentEditable + execCommand 사용 금지.** 이유: 표준 textarea 가 IME 안전.
- **외부 input lib (react-textarea-autosize 등) 추가 금지.** 이유: 의존성 최소화 + textarea 직접 제어 가능.
- **`onPaste` 에서 길이 자르기 금지.** 이유: onChange 와 race. onChange 단일 진입점.
- **fetch /api/chat 호출 금지.** 이유: 이 step 은 controlled component.
- **localStorage 직접 접근 금지** (composer state). 이유: 부모 책임.
- **백스페이스 단축키 커스텀 금지.** 이유: 표준 동작 보존 (커서 위치 등).
