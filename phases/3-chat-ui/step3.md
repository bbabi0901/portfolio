# Step 3: greeting

## 읽어야 할 파일

- `/CLAUDE.md` — 첫 진입 시 AI 가 먼저 인사 (FEAT-014).
- `/docs/UI_GUIDE.md` § 8.9 첫 진입 인사 플로우 (T+0/400/1000/~3000ms).
- `/docs/AI_CONTRACT.md` — greeting 메시지 톤.
- `/spec.json` — `greeting` 객체 (message, typingDelayMs, wordIntervalMs [min, max], rememberDays).
- `/lib/spec-loader.ts` — server-only loader. 이 step 은 client component 라 loader 직접 사용 X.
- `/components/chat/TypingDots.tsx` + `MessageBubble.tsx` — 이전 step.
- `/types/chat.ts` — ChatMessage type.

## 작업

`GreetingPlayer.tsx` — 페이지 진입 시 AI 가 먼저 말을 거는 시뮬레이션. typing dots → 단어 누적 → 완료 → 입력창 focus 유도.

### TDD 순서

1. `specs/components/greeting-player.spec.tsx` 작성 (실패).
2. `components/chat/GreetingPlayer.tsx` + `lib/greeting.ts` (storage util) 구현 (통과).

### 시그니처

```tsx
"use client";
import type { ChatMessage } from "@/types/chat";

export interface GreetingConfig {
  message: string;
  typingDelayMs: number;            // 400 (T+0~400 dots only)
  wordIntervalMs: [number, number]; // [30, 50] random
  rememberDays: number;             // 30
}

export interface GreetingPlayerProps {
  config: GreetingConfig;             // server 가 spec.json 에서 읽어 prop 으로 주입
  onComplete: (msg: ChatMessage) => void;     // 완료 시 부모에 합성된 message 전달
  onCarouselPulse?: () => void;       // 완료 후 carousel 1회 pulse 신호 (옵션)
  onRequestComposerFocus?: () => void;
  /** true 면 사용자가 도중 액션 (메시지 전송 등) 했을 때 호출. fast-forward. */
  fastForwardSignal?: number;
  className?: string;
}
export function GreetingPlayer(props: GreetingPlayerProps): JSX.Element | null;
```

### 동작 시퀀스 (UI_GUIDE.md § 8.9)

```
T+0ms      mount: storage 체크 (rememberDays 내면 즉시 정적 표시 + onComplete)
T+400ms    typing dots only (status="typing")
T+1000ms   본문 단어별 누적 시작 (random interval [30, 50]ms)
T+~3000ms  완료. cursor blink 사라짐. onComplete 호출. onRequestComposerFocus + onCarouselPulse.
T+rememberDays 후 storage 만료 → 다음 진입 시 다시 시뮬레이션.
```

### `lib/greeting.ts` (storage util)

```ts
const STORAGE_KEY = "portfolio.greeted";
const FALLBACK_MEMORY: { value: number | null } = { value: null };

export function readGreetedAt(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return FALLBACK_MEMORY.value;     // localStorage 차단 환경 → 메모리 fallback
  }
}

export function writeGreetedAt(now: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    FALLBACK_MEMORY.value = now;
  }
}

export function isGreetedRecent(rememberDays: number, now = Date.now()): boolean {
  const at = readGreetedAt();
  if (at === null) return false;
  return now - at < rememberDays * 24 * 60 * 60 * 1000;
}
```

### `GreetingPlayer.tsx` 핵심

```tsx
"use client";
import { useEffect, useReducer } from "react";
import { TypingDots } from "./TypingDots";
import { isGreetedRecent, writeGreetedAt } from "@/lib/greeting";

type State =
  | { phase: "init" }
  | { phase: "dots"; startedAt: number }
  | { phase: "streaming"; revealed: string; remaining: string[]; startedAt: number }
  | { phase: "done"; revealed: string };

export function GreetingPlayer({ config, onComplete, fastForwardSignal, ... }: GreetingPlayerProps) {
  const reducedMotion = useMatchMedia("(prefers-reduced-motion: reduce)");
  const [state, dispatch] = useReducer(reducer, { phase: "init" });

  useEffect(() => {
    if (config.message.trim().length === 0) return;

    if (isGreetedRecent(config.rememberDays) || reducedMotion) {
      dispatch({ type: "skip-to-done", text: config.message });
      onComplete(buildMessage(config.message));
      return;
    }

    const t1 = setTimeout(() => dispatch({ type: "start-dots" }), 0);
    const t2 = setTimeout(() => dispatch({ type: "start-streaming", words: tokenize(config.message) }), config.typingDelayMs + 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [config, reducedMotion, onComplete]);

  // streaming 단계: setInterval / setTimeout chain 으로 단어 누적
  useEffect(() => {
    if (state.phase !== "streaming") return;
    const [min, max] = config.wordIntervalMs;
    const interval = min + Math.random() * (max - min);
    const t = setTimeout(() => {
      // 다음 단어 reveal 또는 phase=done
    }, interval);
    return () => clearTimeout(t);
  }, [state, config.wordIntervalMs]);

  // fastForwardSignal 변경 시 즉시 done
  useEffect(() => {
    if (fastForwardSignal && state.phase !== "done") {
      dispatch({ type: "fast-forward", text: config.message });
      writeGreetedAt(Date.now());
      onComplete(buildMessage(config.message));
    }
  }, [fastForwardSignal]);

  // 렌더: phase 별 출력
  if (state.phase === "init") return null;
  if (state.phase === "dots") return <MessageBubble role="greeting" status="typing" content="" />;
  if (state.phase === "streaming") return <MessageBubble role="greeting" status="streaming" content={state.revealed} />;
  return <MessageBubble role="greeting" status="done" content={state.revealed} />;
}

function tokenize(message: string): string[] {
  // 단어/공백 단위 토크나이즈. 한국어는 음절 단위가 너무 빠르니 어절 (whitespace + 부호 단위).
  return message.match(/\S+|\s+/g) ?? [];
}
```

### 보조 hook

```ts
function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
```
- 또는 별도 lib/use-match-media.ts. 위치는 자유.

### Specs (TDD red)

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

describe("GreetingPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  it("config.message 빈 문자열 → null 렌더 + onComplete 미호출", () => { /* … */ });

  it("isGreetedRecent=true (storage 30일 내) → 즉시 done + onComplete", () => {
    localStorage.setItem("portfolio.greeted", String(Date.now() - 1000));
    const onComplete = vi.fn();
    render(<GreetingPlayer config={...} onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalled();
  });

  it("prefers-reduced-motion → 즉시 done + 정적 표시", () => { /* matchMedia mock */ });

  it("정상 시퀀스: T+400 dots → T+1000 streaming 시작 → 단어 누적 → done", async () => {
    /* fake timers advance + 각 phase 클래스/텍스트 검증 */
  });

  it("fastForwardSignal 변경 → 즉시 done + storage 기록", () => { /* … */ });

  it("storage 차단 환경 (localStorage throw) → 메모리 fallback 동작", () => {
    Object.defineProperty(window, "localStorage", {
      value: { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } },
      writable: true,
    });
    /* render + 정상 시뮬레이션 + onComplete */
  });

  it("onComplete 의 message: id 자동 생성, role='greeting', status='done'", () => { /* … */ });

  it("rememberDays 만료 (storage > rememberDays 일 전) → 시뮬레이션 다시", () => { /* … */ });
});

describe("lib/greeting", () => {
  it("isGreetedRecent: storage 없음 → false", () => { /* … */ });
  it("isGreetedRecent: 1일 전 + rememberDays=30 → true", () => { /* … */ });
  it("isGreetedRecent: 31일 전 + rememberDays=30 → false", () => { /* … */ });
  it("storage 차단 시 readGreetedAt → null fallback", () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **prefers-reduced-motion 지원.** 시뮬레이션 모두 생략, 정적 표시 + 즉시 onComplete.
- **storage 차단 fallback 메모리.** 기능 disable 금지.
- **fast-forward 시 storage 기록.** 그래야 새로고침 시 재시작 안 함 (사용자 명시 의도).
- **greeting message 는 spec.json 에서만 읽음.** 하드코드 금지. 부모가 prop 으로 주입.
- **LLM 호출 절대 금지** (이 step). 정적 시뮬레이션만.
- **window.matchMedia 직접 호출은 useEffect 내부에서만** (SSR mismatch 방지).

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
   - `components/chat/GreetingPlayer.tsx`, `lib/greeting.ts`, spec 파일 존재.
   - 모든 spec 통과 (특히 fake timers 시퀀스, reduced motion, storage fallback).
   - `grep -nE "fetch\\(|/api/" components/chat/GreetingPlayer.tsx lib/greeting.ts` → 0건.
3. `phases/3-chat-ui/index.json` step 3 갱신.

## 금지사항

- **/api/chat 호출 금지.** 이유: 시뮬레이션은 정적.
- **외부 typing animation lib (typed.js 등) 추가 금지.** 이유: 의존성. setTimeout chain 으로 충분.
- **단어 토크나이즈에 외부 lib 사용 금지.** 정규식만.
- **storage key 다른 이름 사용 금지.** `portfolio.greeted` 단일 SSoT.
- **rememberDays 의미 임의 변경 금지** (예: 시간 단위 환산 변경). 24*60*60*1000.
