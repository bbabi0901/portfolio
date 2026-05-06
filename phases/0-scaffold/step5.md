# Step 5: test-setup

## 읽어야 할 파일

- `/docs/TESTING.md` — TDD 워크플로우, 테스트 명명, 커버리지 목표
- `/docs/TEST_SCENARIOS.md` — TS-01~70 시나리오 (이름만 참고)
- `/docs/RESPONSIVE.md` — 디바이스 매트릭스 6종 (Playwright projects)
- `/docs/ARCHITECTURE.md` — `tests/`, `specs/` 위치
- `/docs/ADR.md` — ADR-011 Vitest+RTL+msw

이전 step 산출물:

- `/lib/spec-schema.ts` — smoke 테스트 대상
- `/lib/spec-loader.ts` — Node-only loader
- `/spec.json` — 검증 대상
- `/app/layout.tsx` — e2e smoke 대상
- `/components/ui/*` — 후속 task에서 테스트할 컴포넌트들

## 작업

Vitest, Testing Library, msw, Playwright 골격 구축. 실제 시나리오 테스트는 후속 task. 이 step은 setup + smoke 1~2개로 동작 검증만.

### 생성할 파일

1. **`vitest.config.ts`**
   ```ts
   import { defineConfig } from "vitest/config";
   import path from "node:path";

   export default defineConfig({
     test: {
       environment: "jsdom",
       globals: true,
       setupFiles: ["./tests/setup.ts"],
       include: ["specs/**/*.{spec,test}.{ts,tsx}"],
       exclude: ["node_modules", ".next", "tests/e2e/**", "tests/visual/**"],
       coverage: {
         provider: "v8",
         reporter: ["text", "html", "lcov"],
         include: ["lib/**/*.ts", "services/**/*.ts", "components/**/*.tsx"],
         exclude: [
           "**/*.d.ts",
           "**/*.config.*",
           "components/ui/**",  // shadcn 생성 컴포넌트는 자체 테스트 안 함
         ],
         thresholds: {
           lines: 70,
           functions: 70,
           branches: 70,
           statements: 70,
         },
       },
     },
     resolve: {
       alias: {
         "@": path.resolve(__dirname, "./"),
       },
     },
   });
   ```

2. **`tests/setup.ts`**
   ```ts
   import "@testing-library/jest-dom/vitest";
   import { afterAll, afterEach, beforeAll, vi } from "vitest";
   import { server } from "./msw/server";

   // jsdom이 제공하지 않는 API mock
   if (typeof window !== "undefined") {
     window.matchMedia = window.matchMedia || ((q: string) => ({
       matches: false,
       media: q,
       onchange: null,
       addListener: vi.fn(),
       removeListener: vi.fn(),
       addEventListener: vi.fn(),
       removeEventListener: vi.fn(),
       dispatchEvent: vi.fn(),
     }));

     window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

     // ResizeObserver
     class MockResizeObserver {
       observe = vi.fn();
       unobserve = vi.fn();
       disconnect = vi.fn();
     }
     globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
   }

   beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
   afterEach(() => server.resetHandlers());
   afterAll(() => server.close());
   ```

3. **`tests/msw/server.ts`**
   ```ts
   import { setupServer } from "msw/node";
   import { handlers } from "./handlers";

   export const server = setupServer(...handlers);
   ```

4. **`tests/msw/handlers.ts`**
   ```ts
   import { http, HttpResponse } from "msw";

   // 후속 task에서 OpenAI / Anthropic / Google / Notion handler 추가.
   // 이 step에서는 빈 배열.
   export const handlers: ReturnType<typeof http.get>[] = [];
   ```

5. **`playwright.config.ts`**
   ```ts
   import { defineConfig, devices } from "@playwright/test";

   export default defineConfig({
     testDir: "./tests/e2e",
     fullyParallel: true,
     forbidOnly: !!process.env.CI,
     retries: process.env.CI ? 2 : 0,
     workers: process.env.CI ? 1 : undefined,
     reporter: [["html", { open: "never" }], ["list"]],
     use: {
       baseURL: "http://localhost:3000",
       trace: "on-first-retry",
       video: "retain-on-failure",
     },
     projects: [
       {
         name: "iPhone SE",
         use: { ...devices["iPhone SE (3rd generation)"], viewport: { width: 375, height: 667 } },
       },
       {
         name: "iPhone 14 Pro",
         use: { ...devices["iPhone 14 Pro"], viewport: { width: 393, height: 852 } },
       },
       {
         name: "Galaxy S23",
         use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 780 } },
       },
       {
         name: "iPad Mini",
         use: { ...devices["iPad Mini"], viewport: { width: 768, height: 1024 } },
       },
       {
         name: "MacBook 13",
         use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
       },
       {
         name: "4K",
         use: { ...devices["Desktop Chrome"], viewport: { width: 2560, height: 1440 } },
       },
     ],
     webServer: {
       command: "npm run dev",
       url: "http://localhost:3000",
       reuseExistingServer: !process.env.CI,
       timeout: 120_000,
     },
   });
   ```

   **주의**: `viewport`는 spread 뒤에 와야 한다 (`{ ...devices[...], viewport: ... }`). 순서 바뀌면 device default가 덮어쓴다.

6. **`specs/spec-schema.spec.ts`** (smoke unit test)
   ```ts
   import { describe, it, expect } from "vitest";
   import { SpecSchema } from "@/lib/spec-schema";
   import spec from "@/spec.json";

   describe("spec.json", () => {
     it("validates against SpecSchema", () => {
       const result = SpecSchema.safeParse(spec);
       if (!result.success) {
         console.error(result.error.issues);
       }
       expect(result.success).toBe(true);
     });
   });
   ```
   - **주의**: `import spec from "@/spec.json"`은 tsconfig의 `resolveJsonModule: true` 필요 (Next 16 + Vitest 기본 활성).

7. **`tests/e2e/smoke.e2e.ts`**
   ```ts
   import { test, expect } from "@playwright/test";

   test.describe("smoke", () => {
     test("home renders", async ({ page }) => {
       await page.goto("/");
       await expect(page).toHaveTitle(/김윤수/);
       await expect(page.locator("html")).toHaveAttribute("lang", "ko");
       await expect(page.locator("html")).toHaveClass(/dark/);
     });

     test("api/health responds", async ({ request }) => {
       const res = await request.get("/api/health");
       expect(res.ok()).toBe(true);
       const body = await res.json();
       expect(body.runtime).toBe("edge");
     });
   });
   ```

8. **`package.json`** scripts 추가:
   - `"test": "vitest run"`
   - `"test:watch": "vitest"`
   - `"test:coverage": "vitest run --coverage"`
   - `"e2e": "playwright test"`
   - `"e2e:ui": "playwright test --ui"`
   - devDependencies 추가:
     - `vitest@^4`
     - `@vitest/coverage-v8@^4`
     - `@testing-library/react@^16`
     - `@testing-library/jest-dom@^6`
     - `@testing-library/user-event@^14`
     - `jsdom@^29`
     - `msw@^2`
     - `@playwright/test@^1.59`

9. **`.gitignore`** 갱신 (이미 있는 항목 제외):
   - `coverage/`
   - `playwright-report/`
   - `playwright/.cache/`
   - `test-results/`

   `.gitignore`에 이 항목들이 이미 있으면 추가 작업 불필요 (현재 worktree의 `.gitignore`를 먼저 읽어 확인).

10. **Playwright 브라우저 설치** (네트워크 차단 환경에서는 blocked 처리):
    ```bash
    npx playwright install --with-deps chromium webkit
    ```
    - 차단 시 `phases/0-scaffold/index.json` step 5을 `blocked` + `blocked_reason: "Playwright browser download blocked"`.

### 핵심 규칙

- 모든 외부 API 호출은 msw로 mock 강제. msw `onUnhandledRequest: "error"`로 누락 시 fail.
- jsdom 미지원 API는 setup.ts에서 mock.
- `specs/`는 unit/component 테스트, `tests/e2e/`는 Playwright, `tests/msw/`는 모킹.
- 커버리지 임계값 70%로 시작 (lib/services 80~90%은 후속 task에서 점진적 상향).

## Acceptance Criteria

```bash
npm install                              # 새 devDeps 설치
npm run test                             # vitest 통과 (smoke 1개)
npx playwright --version                 # 버전 출력
npx tsc --noEmit                         # 0 exit
npm run lint                             # 통과
npm run build                            # 빌드 + smoke 통과

# E2E (수동 또는 CI)
npm run e2e -- --project="MacBook 13" tests/e2e/smoke.e2e.ts

test -f vitest.config.ts
test -f playwright.config.ts
test -f tests/setup.ts
test -f tests/msw/server.ts
test -f tests/msw/handlers.ts
test -f specs/spec-schema.spec.ts
test -f tests/e2e/smoke.e2e.ts
```

## 검증 절차

1. AC 실행.
2. 체크리스트:
   - vitest가 `specs/spec-schema.spec.ts` 실행 + 통과?
   - Playwright `--list`가 6개 project 인식?
   - msw `onUnhandledRequest: "error"` 적용?
   - jsdom matchMedia/ResizeObserver mock?
   - tests/e2e/smoke.e2e.ts가 실제 dev 서버 띄우고 통과 (수동/CI)?
3. `phases/0-scaffold/index.json` step 5 갱신.

## 금지사항

- **실제 API 키를 테스트에 사용 금지.** 이유: 비용 + 보안.
- **`jest`, `mocha`, `enzyme` 추가 금지.** 이유: ADR-011 Vitest 채택. React 19는 enzyme 미지원.
- **`@testing-library/dom` 직접 import 금지.** 이유: `@testing-library/react`가 transitive로 제공.
- **e2e에서 production build 사용 금지.** 이유: dev hot reload + 빠른 피드백. (CI에서는 별도 정책 가능, 후속 task.)
- **MSW Service Worker (`msw/browser`) setup 금지.** 이유: Node 측만 사용. 브라우저 mock 불필요 (Playwright는 실제 dev 서버).
- **`onUnhandledRequest: "warn"` 사용 금지.** 이유: 미선언 핸들러를 silent하게 통과시킴 → 테스트 신뢰도 저하.
- **shadcn 컴포넌트(`components/ui/**`) 커버리지 검사 금지.** 이유: 외부 코드 + 우리 책임 외.
- **70% 미만 커버리지 임계값 설정 금지.** 이유: 최소 품질선.
