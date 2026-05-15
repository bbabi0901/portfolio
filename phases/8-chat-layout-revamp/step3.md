# Step 3: model-switcher-inline

## 읽어야 할 파일

- `/CLAUDE.md` — 다크 only, AI 슬롭 금지.
- `/docs/UI_GUIDE.md` — "Composer 하단 액션 row" 절 (좌측 ModelSwitcher 인라인).
- `/docs/RESPONSIVE.md` — "Composer (FEAT-030 prominent box)" 표의 ModelSwitcher 라벨 행 (sm: 짧은 "4.7", md+: 풀 "Opus 4.7").
- `/spec.json` — FEAT-001 (Multi-model Chat), FEAT-030, TS-73 (`ModelSwitcher rendered inline inside Composer (not in Header)`).
- `/components/chat/ModelSwitcher.tsx` — 현재 shadcn `Select` dropdown 형태.
- `/components/chat/ChatRoot.tsx` — 현재 Header 우측에 ModelSwitcher 렌더. step 2 에서 Composer.leftAction prop 받음.
- `/components/chat/Composer.tsx` — step 2 결과: leftAction prop 노출.
- `/specs/components/model-switcher.spec.tsx` (또는 specs/model-switcher.spec.tsx) — 기존 ModelSwitcher 단위 spec.

## 작업

ModelSwitcher 를 Composer 좌하단 인라인 위치로 이동. Header 에서 제거. localStorage 모델 저장 로직은 ChatRoot 가 그대로 보유.

### TDD 순서

1. `specs/model-switcher.spec.tsx` 에 TS-73 케이스 추가 + 회귀 spec 보강 (실패).
2. ModelSwitcher 시각 스타일 변경 + ChatRoot 의 Header → Composer.leftAction 으로 이동 (통과).
3. 회귀: TS-04 (model switching localStorage), 기존 unit spec.

### 시그니처 변경

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown } from "lucide-react";

export interface ModelSwitcherProps {
  value: ModelId;
  onChange: (id: ModelId) => void;
  available: ModelId[];
  /** sm 에서 짧은 라벨 사용 ("4.7" vs "Opus 4.7"). 기본 false (full). */
  compact?: boolean;
  className?: string;
}
```

### 시각 스타일

```tsx
<Select value={value} onValueChange={onChange} disabled={available.length === 0}>
  <SelectTrigger
    className={cn(
      "h-8 gap-1 rounded-full border border-neutral-700 bg-transparent px-3 text-xs text-neutral-300",
      "hover:border-neutral-500 hover:text-white",
      "focus:outline-none focus:ring-0",
      "data-[disabled]:opacity-50",
      className,
    )}
    aria-label="답변 모델 선택"
  >
    <SelectValue>
      {compact ? toShortLabel(value) : toLongLabel(value)}
    </SelectValue>
    {/* shadcn 의 기본 ChevronDown 표시 — Trigger 가 자동 렌더 */}
  </SelectTrigger>
  <SelectContent className="border border-neutral-700 bg-neutral-900 text-neutral-200">
    {available.map((id) => (
      <SelectItem key={id} value={id} className="text-xs">
        {toLongLabel(id)}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- `toShortLabel` / `toLongLabel` 헬퍼 (같은 파일 안):
  - gpt-4o-mini → short "GPT-4o" / long "GPT-4o mini"
  - claude-3-5-haiku-latest → short "Haiku" / long "Claude 3.5 Haiku"
  - gemini-2.0-flash-exp → short "Gemini" / long "Gemini 2.0 Flash"
- `available.length === 0` → Trigger disabled. `aria-disabled="true"`.

### ChatRoot 변경

Header 의 ModelSwitcher 제거:
```tsx
<header className="flex items-center justify-between gap-2 border-b border-neutral-900 py-3">
  <h1 className="text-sm font-medium text-neutral-200">김윤수 — AI Portfolio</h1>
  <div className="flex items-center gap-1">
    <ClearButton onClick={clearConfirm} />
  </div>
</header>
```

Composer 에 ModelSwitcher 주입:
```tsx
const useCompact = useMatchMedia("(max-width: 767px)");
<Composer
  ref={composerRef}
  value={input}
  onChange={setInput}
  onSubmit={handleSend}
  disabled={isLoading}
  leftAction={
    <ModelSwitcher
      value={modelId}
      onChange={setModelId}
      available={availableModels}
      compact={useCompact}
    />
  }
/>
```

- `useMatchMedia` 가 ChatRoot 또는 별도 hook (`lib/use-match-media.ts`) 에 없으면 새로 추가. window.matchMedia + addEventListener 사용 (SSR 안전: useState + useEffect).
- localStorage 모델 저장/복원 로직은 ChatRoot 의 useEffect 그대로 보존.

### `specs/model-switcher.spec.tsx` 추가 케이스 (TS-73)

```tsx
describe("ModelSwitcher inline (TS-73)", () => {
  it("Trigger 클래스에 rounded-full + h-8 + bg-transparent (인라인 형태)", () => {
    const { container } = render(
      <ModelSwitcher value="gpt-4o-mini" onChange={vi.fn()} available={["gpt-4o-mini"]} />
    );
    const trigger = container.querySelector('[role="combobox"], button[aria-label="답변 모델 선택"]');
    expect(trigger?.className).toMatch(/rounded-full/);
    expect(trigger?.className).toMatch(/h-8/);
    expect(trigger?.className).toMatch(/bg-transparent/);
  });

  it("compact=true → short label", () => {
    const { getByText } = render(
      <ModelSwitcher value="gpt-4o-mini" onChange={vi.fn()} available={["gpt-4o-mini"]} compact />
    );
    expect(getByText(/GPT-4o(?! mini)/)).toBeInTheDocument(); // short
  });

  it("compact=false → long label '... mini'", () => {
    const { getByText } = render(
      <ModelSwitcher value="gpt-4o-mini" onChange={vi.fn()} available={["gpt-4o-mini"]} />
    );
    expect(getByText(/GPT-4o mini/)).toBeInTheDocument();
  });

  it("available=[] → Trigger disabled", () => {
    const { container } = render(<ModelSwitcher value="gpt-4o-mini" onChange={vi.fn()} available={[]} />);
    const trigger = container.querySelector('[aria-label="답변 모델 선택"]');
    expect(trigger).toHaveAttribute("data-disabled");
  });
});

describe("ChatRoot ModelSwitcher placement (TS-73 integration)", () => {
  it("Header 안에 ModelSwitcher 가 없다", () => {
    const { container } = render(<ChatRoot ... />);
    const header = container.querySelector("header");
    expect(header?.querySelector('[aria-label="답변 모델 선택"]')).toBeNull();
  });

  it("Composer (form) 안에 ModelSwitcher 가 있다", () => {
    const { container } = render(<ChatRoot ... />);
    const form = container.querySelector("form");
    expect(form?.querySelector('[aria-label="답변 모델 선택"]')).not.toBeNull();
  });
});
```

회귀 spec (TS-04): localStorage 저장/복원 케이스는 ChatRoot.tsx 통합 spec 에 이미 있음 — 그대로 통과.

### 핵심 규칙 (위반 금지)

- **ModelSwitcher 가 Composer 안 + Header 안 동시 렌더 금지** (사용자 혼란).
- **localStorage 모델 저장 로직 변경 금지** — ChatRoot 의 책임 보존.
- **shadcn `<Select>` 외 dropdown lib 추가 금지**.
- **ModelSwitcher 가 ChatRoot 의 modelId state 를 직접 수정 금지** — controlled prop (value + onChange) 유지.
- **useMatchMedia hook 이 SSR 시 window 접근 금지** — useState + useEffect 패턴.
- **`compact` 분기를 server-side render mismatch 일으키지 마라** — 초기 false, 마운트 후 갱신.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/model-switcher.spec.tsx
npm run test    # 전체 회귀
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

수동 dev 검증:
```bash
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 RATE_LIMIT_BYPASS=1 npm run dev -- -p 3001
# 브라우저:
# - Header 우측에 ModelSwitcher 없음 (햄버거 + ClearButton 만)
# - Composer 좌하단에 모델 라벨 dropdown
# - 모델 변경 → localStorage 의 portfolio.model 갱신
# - 페이지 새로고침 → 마지막 선택 모델 복원
```

## 검증 절차

1. AC 실행.
2. 체크:
   - Header 안에 ModelSwitcher 없음 (회귀).
   - Composer.form 안에 ModelSwitcher 있음.
   - TS-73 + 기존 ModelSwitcher spec 모두 통과.
   - localStorage 동작 회귀 통과.
3. `phases/8-chat-layout-revamp/index.json` step 3 갱신 (이 task 의 마지막).
4. `phases/index.json` 의 `8-chat-layout-revamp` status `completed` 로 자동 전이.

## 금지사항

- **새 모델 SDK / provider 추가 금지** (FEAT-001 보존).
- **Header 의 ClearButton 위치 / 스타일 변경 금지** (이 task 외).
- **JumpToLatestButton 변경 금지** (FEAT-015).
- **사이드 메뉴 / about / experience / contact 페이지 변경 금지.**
- **useChat / messages 상태 관련 변경 금지.**
