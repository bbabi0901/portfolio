# Step 0: atoms

## 읽어야 할 파일

- `/CLAUDE.md` — 디자인 규칙 (다크 only, AI 슬롭 안티패턴 금지, lime-300 포인트 색).
- `/docs/UI_GUIDE.md` — 컴포넌트별 클래스 명세, 색상 토큰, 애니메이션 화이트리스트.
- `/docs/PAGES.md` — / 페이지 (채팅) 와이어프레임.
- `/docs/RESPONSIVE.md` — Carousel 슬라이드 수 (모바일 ~1.2, 태블릿 ~2, 데스크톱 ~3).
- `/spec.json` — `features[]` 의 FEAT-001 (Multi-model Chat), FEAT-002 (SSE typing dots), FEAT-003 (Suggestion Carousel), FEAT-015 (sticky scroll → JumpToLatest).
- `/components/ui/` — shadcn 컴포넌트 (button, carousel, select 활용).
- `/public/data/suggestions.json` — 빌드 산출물 (이전 task `1-content-pipeline` 에서 생성). 이 step 에서는 type 만 import 하고 fixture 로 mock.
- `/types/portfolio.ts` — Question 타입.
- `/app/globals.css` — `@theme` 토큰, `@keyframes typing-dot`.

## 작업

채팅 UI 의 가장 작은 atoms 4개. 각 atom 은 자기완결적, props 만으로 동작, store 의존성 없음. 모두 `"use client"` (인터랙션 또는 motion 필요).

### TDD 순서

1. `specs/components/typing-dots.test.tsx` 외 spec 4개 작성 (실패).
2. 컴포넌트 구현 (통과).

### 생성할 파일

#### 1. `components/chat/TypingDots.tsx`

```tsx
"use client";
import { cn } from "@/lib/utils";

export interface TypingDotsProps { className?: string; ariaLabel?: string }

export function TypingDots({ className, ariaLabel = "응답 생성 중" }: TypingDotsProps) {
  // dom: <span role="status" aria-live="polite" aria-label={ariaLabel}>
  //        <span class="dot1">•</span><span class="dot2">•</span><span class="dot3">•</span>
  //      </span>
  // 클래스: "inline-flex gap-1 text-neutral-400" + 각 dot 에 animate-[typing-dot_0.4s_ease-in-out_infinite]
  // delay 0/150/300ms 는 inline style.
  // prefers-reduced-motion: motion-reduce:animate-none.
}
```
- `@keyframes typing-dot` 는 globals.css 에 이미 정의됨 (0%/100% opacity 0.3, 50% opacity 1).
- `role="status" aria-live="polite"` 필수 (screen reader 알림).

#### 2. `components/chat/SuggestionCarousel.tsx` + `SuggestionBadge.tsx`

```tsx
// SuggestionBadge.tsx
"use client";
export interface SuggestionBadgeProps {
  text: string;
  category: string;       // intro | project | tech | contact (UI_GUIDE.md 의 절제 색)
  visited?: boolean;      // 한 번 누르면 시각적 흐림
  onClick: () => void;
  className?: string;
}
export function SuggestionBadge(props: SuggestionBadgeProps): JSX.Element;

// SuggestionCarousel.tsx
"use client";
import type { Question } from "@/types/portfolio";
export interface SuggestionCarouselProps {
  questions: Question[];
  visitedIds: Set<string>;
  onSelect: (q: Question) => void;
  className?: string;
}
export function SuggestionCarousel(props: SuggestionCarouselProps): JSX.Element;
```

- shadcn Carousel (Embla) 기반. `loop=false`, `align="start"`.
- 모바일 `basis-[80%]`, 태블릿 `md:basis-1/2`, 데스크톱 `lg:basis-1/3`.
- `questions.length === 0` → carousel 자체 미렌더 (null return).
- 좌/우 화살표 (shadcn `CarouselPrevious/Next`), 끝에 도달 시 disabled 자동.
- visited 시 opacity-60 또는 text-neutral-500 (subtle).
- **AI 슬롭 금지**: gradient, glow, blur 안됨. neutral-800 border, hover white border.

#### 3. `components/chat/ModelSwitcher.tsx`

```tsx
"use client";
export type ModelId = "gpt-4o-mini" | "claude-3-5-haiku-latest" | "gemini-2.0-flash-exp";

export interface ModelSwitcherProps {
  value: ModelId;
  onChange: (id: ModelId) => void;
  available: ModelId[];      // 환경 키 있는 모델만
  className?: string;
}
export function ModelSwitcher(props: ModelSwitcherProps): JSX.Element;
```

- shadcn `Select` 기반. label 짧게 (`"GPT-4o mini"` / `"Claude 3.5 Haiku"` / `"Gemini 2.0 Flash"`).
- `available` 가 빈 배열이면 disabled + "no models" 텍스트.
- 변경 시 `onChange` 호출. **localStorage 저장은 호출측 (ChatRoot, step 4) 책임**, 이 컴포넌트는 controlled prop 만.
- aria-label `"답변 모델 선택"`.

#### 4. `components/chat/JumpToLatestButton.tsx`

```tsx
"use client";
export interface JumpToLatestButtonProps {
  visible: boolean;
  onClick: () => void;
  className?: string;
}
export function JumpToLatestButton(props: JumpToLatestButtonProps): JSX.Element;
```

- visible=false → null return (DOM 미렌더).
- visible=true → fade-in (`animate-[fade-in_0.2s_ease-out]` 또는 transition-opacity).
- 위치 / sticky 는 부모 책임. 이 컴포넌트는 그냥 button + lucide `ArrowDown` 아이콘 + "최신으로" 텍스트.
- aria-label `"가장 최신 메시지로 이동"`.

### Specs (TDD red 단계)

`specs/components/atoms.spec.tsx` (또는 4 파일 분리):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TypingDots } from "@/components/chat/TypingDots";
import { SuggestionCarousel } from "@/components/chat/SuggestionCarousel";
import { ModelSwitcher } from "@/components/chat/ModelSwitcher";
import { JumpToLatestButton } from "@/components/chat/JumpToLatestButton";

describe("TypingDots", () => {
  it("role status + aria-live polite", () => { /* … */ });
  it("기본 aria-label '응답 생성 중'", () => { /* … */ });
  it("3개 점 렌더", () => { /* … */ });
});

describe("SuggestionCarousel", () => {
  it("questions 비어있으면 null 렌더", () => { /* container.firstChild === null */ });
  it("각 question 의 text 렌더", () => { /* … */ });
  it("visited Set 에 포함된 id → opacity-60 클래스", () => { /* … */ });
  it("badge 클릭 시 onSelect(question) 호출", () => { /* … */ });
});

describe("ModelSwitcher", () => {
  it("available 빈 배열 시 disabled", () => { /* … */ });
  it("value 가 currently selected 표시", () => { /* … */ });
  it("선택 변경 시 onChange(newId) 호출", () => { /* … */ });
});

describe("JumpToLatestButton", () => {
  it("visible=false → null", () => { /* … */ });
  it("visible=true → button 렌더 + 클릭 시 onClick", () => { /* … */ });
  it("aria-label '가장 최신 메시지로 이동'", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **`"use client"` 필수** (각 컴포넌트 파일 첫 줄). 이유: 인터랙션/motion.
- **AI 슬롭 안티패턴 금지** (CLAUDE.md): backdrop-filter blur, gradient-text, glow, 보라/네온, blur-3xl orb.
- **prefers-reduced-motion 지원**: animate 클래스에 `motion-reduce:animate-none` 같이.
- **shadcn 컴포넌트 직접 수정 금지**. `components/ui/*` 는 토큰만으로 커스터마이징.
- **store/Zustand/jotai 사용 금지** (이 step). props drilling 만.
- **이미지/SVG 자산 추가 금지** (아이콘은 lucide-react).

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
   - 4 컴포넌트 파일 + 1~4 spec 파일 존재.
   - 모든 spec 통과.
   - `grep -nE "backdrop-filter|gradient-text|blur-3xl|drop-shadow-\[" components/chat/` → 0건.
   - `grep -nE "^[^/]*from ['\"]node:" components/chat/` → 0건 (client component 는 Node 모듈 import 금지).
3. `phases/3-chat-ui/index.json` step 0 갱신.

## 금지사항

- **localStorage 직접 접근 금지** (ModelSwitcher 내). 이유: controlled prop 패턴. 저장은 ChatRoot (step 4).
- **/api/chat 호출 금지** (이 step 의 atom 들은 모두 presentational).
- **next/image 사용 금지** (이 step 에서). 이유: atom 들은 텍스트/아이콘만.
- **Carousel autoplay 활성화 금지.** 이유: ADR-015 + UI_GUIDE.md 의 사용자 통제 원칙.
- **Tailwind class 외 inline style 사용 금지** (delay timing 같은 동적 값 제외).
