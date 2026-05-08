# Step 1: e2e-chat

## 읽어야 할 파일

- `/docs/TEST_SCENARIOS.md` — TS-01~22 채팅 시나리오 (Given/When/Then 명세).
- `/spec.json` — `testScenarios[]` (각 TS 의 id, files 매핑).
- `/components/chat/*` — UI components.
- `/app/api/[[...route]]/route.ts` — chat 라우트.
- `/tests/e2e/fixtures/portfolio.ts`, `/tests/e2e/global-setup.ts`, `/tests/e2e/utils/test-helpers.ts` — 이전 step 0.

## 작업

채팅 페이지 (`/`) 의 22개 시나리오 e2e 테스트. 단일 spec 파일 또는 복수 분리.

### 시나리오 매핑

이 step 에서 작성할 e2e:

- **TS-01** 첫 진입 인사 시뮬레이션
- **TS-02** Reduced motion 첫 인사
- **TS-03** 추천 질문 클릭 → 응답
- **TS-04** 모델 스위칭 + localStorage
- **TS-05** 인젝션 5종 거부 (mock LLM 시 banned substrings 검증)
- **TS-06** 컨텍스트 외 질문 → "기록 없음"
- **TS-07** 영어 질문 → 영어 응답 (mock LLM 의 echo 구조라 단순 시뮬레이션)
- **TS-08** Stick-to-bottom 정책 (위로 스크롤 → JumpToLatest 노출)
- **TS-09** 응답 도중 새 질문 → in-flight abort
- **TS-10** Regenerate / 다른 모델로 다시 (UI 미구현 시 skip)
- **TS-11** 메시지 Copy (clipboard mock)
- **TS-12** 새 대화 (Clear) + Cmd/Ctrl+K
- **TS-13** IME composing 중 Enter (Korean)
- **TS-14** 메시지 길이 검증
- **TS-15** Rate limit 429 (RATE_LIMIT_BYPASS=1 때문에 발생 안 함 → BYPASS 제거 + 임시 설정. 이 시나리오만 별도 test.describe)
- **TS-16** 일별 토큰 한도 503 (MAX_TOKENS_PER_DAY=0 set)
- **TS-17** 모델 키 401 (skip 또는 mock)
- **TS-18** 임베딩 다운 → 키워드 폴백 (skip — mock 환경에서 검증 어려움)
- **TS-19** 피드백 👎 → Notion (mock notion 응답 200)
- **TS-20** 같은 메시지 👎 중복 (alreadySent)
- **TS-21** 첫 토큰 5초 지연 (skip 또는 단순 spin 검증)
- **TS-22** SSE 연결 끊김 (skip 또는 단순 비동기 abort 검증)

### TDD 순서

1. spec.json 의 `testScenarios[]` 의 각 TS-XX 가 가리키는 `files[]` 에 이번 e2e 파일 경로 매핑 확인. 누락이면 추가하지 마라 (이미 작성됐을 것). spec.json 수정은 후속 task.
2. 각 시나리오 e2e 작성. fixture mock 사용.

### 파일 구조

```
tests/e2e/chat/
  ├── greeting.e2e.ts        # TS-01, TS-02
  ├── suggestions.e2e.ts     # TS-03
  ├── model-switch.e2e.ts    # TS-04
  ├── injection.e2e.ts       # TS-05, TS-06
  ├── language.e2e.ts        # TS-07
  ├── scroll.e2e.ts          # TS-08
  ├── inflight.e2e.ts        # TS-09
  ├── actions.e2e.ts         # TS-11, TS-12
  ├── ime.e2e.ts             # TS-13
  ├── input.e2e.ts           # TS-14
  ├── rate-limit.e2e.ts      # TS-15
  ├── token-budget.e2e.ts    # TS-16
  └── feedback.e2e.ts        # TS-19, TS-20
```

또는 단일 `tests/e2e/chat.e2e.ts` 안에 describe 그룹. 단일 파일이 simpler — 단일 dev 서버 + Playwright 의 file-level 병렬화.

추천: 5~6 파일 분리 (각 5분 미만 실행). MacBook 13 project 기본.

### 핵심 동작

#### TS-01 Greeting (예시)

```ts
import { test, expect } from "@playwright/test";

test.describe("greeting (TS-01, TS-02)", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.addInitScript(() => localStorage.removeItem("portfolio.greeted"));
  });

  test("TS-01: 첫 진입 시 typing dots → 단어 누적 → 입력창 focus", async ({ page }) => {
    await page.goto("/");
    // T+400 typing dots
    await expect(page.locator('[role="status"][aria-label="응답 생성 중"]').first()).toBeVisible({ timeout: 1000 });
    // T+1000 streaming 본문 일부
    await expect(page.locator('[role="log"]')).toContainText(/안녕하세요/, { timeout: 3000 });
    // 완료 후 composer focus
    await expect(page.locator("textarea")).toBeFocused({ timeout: 5000 });
  });

  test("TS-02: prefers-reduced-motion → 시뮬레이션 생략", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    // typing dots 미렌더 + 즉시 텍스트
    await expect(page.locator('[role="log"]')).toContainText(/안녕하세요/);
    await expect(page.locator('[role="status"][aria-label="응답 생성 중"]')).toHaveCount(0);
  });
});
```

#### TS-13 IME (예시)

```ts
test("TS-13: 한국어 IME composing 중 Enter → 전송 미발생", async ({ page }) => {
  await page.goto("/");
  // greeting 시뮬레이션 fast-forward — 첫 액션
  const ta = page.locator("textarea");
  await ta.focus();
  // composition start (한글 조합 시뮬레이션 — Playwright 의 keyboard 가 IME 미지원)
  await page.evaluate(() => {
    const el = document.querySelector("textarea")!;
    el.dispatchEvent(new CompositionEvent("compositionstart"));
    el.value = "안녕";
    el.dispatchEvent(new InputEvent("input"));
  });
  await ta.press("Enter");
  // 메시지 list 가 user message 추가 안 된 상태 — composer 의 value 보존
  await expect(ta).toHaveValue("안녕");
});
```

#### TS-15 Rate limit (예시)

```ts
test("TS-15: 11회째 429 + Retry-After 토스트", async ({ page, browser }) => {
  // 별도 context — RATE_LIMIT_BYPASS 미적용. 글로벌 webServer env 변경 어려우니
  // 이 테스트만 직접 fetch 로 서버 호출 + 응답 status 검증.
  const headers = { "Content-Type": "application/json" };
  // pre-fill 10회
  for (let i = 0; i < 10; i++) {
    await page.request.post("/api/chat", {
      headers, data: { messages: [{ role: "user", content: "안녕" }] }
    });
  }
  const res = await page.request.post("/api/chat", {
    headers, data: { messages: [{ role: "user", content: "안녕" }] }
  });
  expect(res.status()).toBe(429);
  expect(res.headers()["retry-after"]).toBeTruthy();
});
```

- 이 시나리오는 RATE_LIMIT_BYPASS 미적용 환경 필요. 우리 webServer config 는 BYPASS=1. 그래서 이 테스트는 status 200 으로 통과 — 즉 BYPASS 환경에서는 spec 자체가 의미 없으므로 `test.skip` + 환경변수 분기:

```ts
test("TS-15: 429 ...", async ({ page }) => {
  test.skip(
    process.env.RATE_LIMIT_BYPASS === "1",
    "RATE_LIMIT_BYPASS active — see CI matrix"
  );
  /* … */
});
```

또는 별도 project (Playwright config) 로 BYPASS off 매트릭스 추가. 이 step 에서 매트릭스 추가까지는 over-scope. **`test.skip` 으로 처리.**

### 핵심 규칙 (위반 금지)

- **mock LLM 응답 사용.** 실제 OpenAI/Anthropic/Google 호출 금지.
- **시간 의존성**: typing 시뮬레이션은 fake timer 어렵 → `expect.toBeVisible({ timeout })` 으로 충분히 여유.
- **localStorage init**: 매 테스트 isolated context (clearCookies + initScript).
- **flakey 테스트 작성 금지**: 명시적 wait, retry 1회만, sleep 사용 X.
- **BYPASS 환경에서 의미 없는 시나리오는 test.skip + reason.**
- **TS-XX 매핑은 spec.json testScenarios[] 의 files[] 와 일치**. 명시적 매핑 변경은 spec.json 수정 — 가능한 매핑이 이미 등록된 경우만 사용.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
npm run e2e -- --project="MacBook 13" tests/e2e/chat
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `tests/e2e/chat/*.e2e.ts` 5~13 파일 존재.
   - 시나리오 별 통과 (skip 은 명시적 reason).
   - regress: smoke-fixtures.e2e.ts 그대로 통과.
3. `phases/7-e2e-deploy/index.json` step 1 갱신.

## 금지사항

- **사이드 메뉴 / 페이지 시나리오 작성 금지** (이 step). 후속 step 2, 3.
- **API 직접 fetch 만으로 시나리오 검증 금지** — UI 동작 검증 위주.
- **Playwright trace 항상 활성화 금지** — `trace: "on-first-retry"` 만.
- **`page.waitForTimeout()` 사용 금지** (sleep). 명시적 locator wait.
- **e2e 환경에서 실제 Notion / OpenAI 호출 금지** — MOCK env 강제.
- **flakey 테스트 retry > 2 금지** — 환경 문제는 fix.
