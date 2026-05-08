# Step 0: e2e-fixtures

## 읽어야 할 파일

- `/CLAUDE.md` — `MOCK_LLM=1`, `MOCK_NOTION=1` 환경변수 정책.
- `/docs/TESTING.md` — TDD 워크플로우, msw 핸들러 위치.
- `/docs/TEST_SCENARIOS.md` — TS-01~70 (이번 task 가 다 다룬다).
- `/playwright.config.ts` — 6 디바이스 프로젝트 + webServer port 3100.
- `/tests/setup.ts`, `/tests/msw/server.ts`, `/tests/msw/handlers.ts` — vitest 측 (참고용).
- `/data/portfolio.sample.json` — 빌드 산출물 sample.
- `/lib/portfolio-data.ts` — Node loader.

## 작업

E2E 전용 fixture + Playwright init script. 모든 Playwright 테스트는 같은 dev 서버에 붙으므로, **dev 서버가 사용할 환경변수**와 **클라이언트가 받을 fixture 응답** 을 사전 준비.

### TDD 순서

이 step 은 **fixture-first**. spec 작성보다 fixture 가 먼저. 이후 step 1~3 의 e2e 테스트들이 이 fixture 를 사용.

1. fixture 파일 + helper 작성.
2. 단순 smoke e2e 추가 (`tests/e2e/smoke-fixtures.e2e.ts` — fixture 정상 로드 검증).
3. 통과.

### 생성할 파일

#### 1. `tests/e2e/fixtures/portfolio.ts`

```ts
/**
 * E2E 전용 portfolio fixture. data/portfolio.server.json 미존재 시 사용.
 * dev 서버가 이 파일을 import 하지 않도록 — Playwright global-setup 이
 * data/portfolio.server.json 으로 복사 (또는 symlink) 한다.
 */
import type { PortfolioData } from "@/types/portfolio";

export const E2E_PORTFOLIO_FIXTURE: PortfolioData = { /* … */ };
```

- 최소 5~10 chunks (다양한 sourceTitle, headingPath, sourceUrl).
- 한 chunk 는 비공개 (sourceUrl=null) 로 출처 chip disabled 시나리오.
- `category: "profile"` 청크 1~2개 (about page).
- `category: "project"` 청크 3~5개 (experience page).
- `embedding: number[1536]` 은 deterministic hash-based 가 아니라 단순 `[0, 0, 0, ..., 0]` 또는 `[1, 0, 0, ...]` 같은 단순 vector. 이유: e2e 는 retriever 정확도 검증이 아니라 흐름 검증.

#### 2. `tests/e2e/global-setup.ts`

```ts
import fs from "node:fs";
import path from "node:path";
import { E2E_PORTFOLIO_FIXTURE } from "./fixtures/portfolio";

export default async function globalSetup() {
  // 1. data/portfolio.server.json 가 없으면 fixture 로 생성.
  // 2. public/data/suggestions.json 가 없으면 spec.json 의 suggestedQuestions 로 생성.
  const root = process.cwd();
  const serverJson = path.join(root, "data", "portfolio.server.json");
  if (!fs.existsSync(serverJson)) {
    fs.mkdirSync(path.dirname(serverJson), { recursive: true });
    fs.writeFileSync(serverJson, JSON.stringify(E2E_PORTFOLIO_FIXTURE, null, 2));
  }
  const suggestionsJson = path.join(root, "public", "data", "suggestions.json");
  if (!fs.existsSync(suggestionsJson)) {
    fs.mkdirSync(path.dirname(suggestionsJson), { recursive: true });
    const spec = JSON.parse(fs.readFileSync(path.join(root, "spec.json"), "utf-8"));
    fs.writeFileSync(suggestionsJson, JSON.stringify({ questions: spec.suggestedQuestions }, null, 2));
  }
}
```

#### 3. `playwright.config.ts` 갱신

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...prev,
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: "MOCK_LLM=1 MOCK_NOTION=1 SKIP_NOTION_SYNC=1 RATE_LIMIT_BYPASS=1 npm run dev",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
    },
  },
});
```

- **dev port 3100 (이미 step 5 (test-setup) 에 적용)** — 일반 dev 의 3000 와 격리.
- `RATE_LIMIT_BYPASS=1` 로 e2e 시나리오에서 429 충돌 방지.
- `MOCK_LLM=1` 로 chat 라우트가 mock model 사용.
- `MOCK_NOTION=1` 으로 feedback/contact 라우트가 mock 응답.

#### 4. `tests/e2e/utils/test-helpers.ts`

```ts
import type { Page } from "@playwright/test";

/** 채팅 메시지 마지막 어시스턴트 응답 텍스트 추출. */
export async function getLastAssistantText(page: Page): Promise<string> { /* … */ }

/** 추천 질문 carousel 의 첫 번째 badge 클릭. */
export async function clickFirstSuggestion(page: Page): Promise<void> { /* … */ }

/** 사용자 메시지 전송 (input → Enter). */
export async function sendChatMessage(page: Page, text: string): Promise<void> { /* … */ }

/** 사이드 메뉴 열기 (햄버거 클릭). */
export async function openSideMenu(page: Page): Promise<void> { /* … */ }

/** SSE 응답 도착까지 대기. typing dots 사라지면 done. */
export async function waitForChatResponse(page: Page, timeoutMs?: number): Promise<void> { /* … */ }
```

#### 5. `tests/e2e/smoke-fixtures.e2e.ts`

```ts
import { test, expect } from "@playwright/test";

test.describe("fixtures", () => {
  test("data/portfolio.server.json fixture loads", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
  });

  test("home page renders with greeting + carousel", async ({ page }) => {
    await page.goto("/");
    // greeting 시뮬레이션 또는 정적 표시
    await expect(page.locator("h1, [role='log']")).toBeVisible();
    // 추천 질문 carousel
    await expect(page.locator('[aria-label="추천 질문"], [data-carousel]').first()).toBeVisible();
  });
});
```

### 핵심 규칙 (위반 금지)

- **fixture 는 e2e 전용.** vitest 또는 build 산출물 덮어쓰기 금지.
- **global-setup 이 기존 portfolio.server.json 덮어쓰기 금지** (있으면 사용, 없으면 fixture 작성).
- **Playwright env 는 process.env 와 격리.** 우리 dev 머신의 NOTION_TOKEN 같은 secret 사용 금지.
- **port 3100 단일.** dev 와 e2e 동시 실행 가능.
- **mock LLM 응답은 deterministic.** non-deterministic 응답 (Math.random) 금지.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
npx playwright install chromium     # CI 1회만
npm run e2e -- --project="MacBook 13" tests/e2e/smoke-fixtures.e2e.ts
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `tests/e2e/fixtures/portfolio.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/utils/test-helpers.ts`, `tests/e2e/smoke-fixtures.e2e.ts` 존재.
   - smoke-fixtures.e2e.ts 통과.
   - `playwright.config.ts` 의 webServer env 갱신.
   - global-setup 이 portfolio.server.json 자동 생성.
3. `phases/7-e2e-deploy/index.json` step 0 갱신.

## 금지사항

- **실제 e2e 시나리오 (TS-01~70) 작성 금지** (이 step). 후속 step 1~4.
- **Playwright trace upload 외 비용 발생 외부 service 통합 금지.**
- **Playwright `test.use({ storageState })` 인증 적용 금지** (사이트는 stateless).
- **dev 서버 port 3000 변경 금지** — playwright 만 3100.
- **`process.env.CI` 외 dev/test 분기 환경 변수 추가 금지.**
- **fixture 데이터에 실제 사용자 PII (전화, 주소) 포함 금지.**
