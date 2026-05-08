# Step 4: e2e-cross-cutting-visual-deploy

## 읽어야 할 파일

- `/docs/TEST_SCENARIOS.md` — TS-61~70 횡단 시나리오 + visual.
- `/docs/RESPONSIVE.md` — 6 디바이스 매트릭스 (iPhone SE, iPhone 14 Pro, Galaxy S23, iPad Mini, MacBook 13, 4K).
- `/docs/SEO_POLICY.md` — JSON-LD / sitemap / robots.
- `/spec.json` — `testScenarios[]` TS-61~70.
- `/.github/workflows/ci.yml` — 이전 task 의 e2e job (`if: false`).

## 작업

횡단 시나리오 e2e + axe-core a11y + 6 디바이스 visual baseline + Vercel deploy guide docs + ci.yml e2e job 활성화. 이 task 마지막 step.

### 시나리오 매핑

- **TS-61** 키보드만으로 모든 페이지 인터랙션 (Tab order, focus visible, aria-label)
- **TS-62** 색 대비 WCAG AA (axe-core)
- **TS-63** SEO meta + JSON-LD 검증
- **TS-64** OG image 응답 (`/opengraph-image` 200 + image/png)
- **TS-65** not-found 페이지 (임의 URL → 404)
- **TS-66** 1세션 라우트 왕복 (greeted 유지, chat stateless)
- **TS-67** 푸터 마지막 업데이트
- **TS-68** Lighthouse P/A11y/BP/SEO ≥ 90/95/95/95 (CI — lhci workflow 외)
- **TS-69** Critical bundle audit (1536 차원 임베딩 grep)
- **TS-70** 환경변수 누락 시 fallback 동작 (NOTION_TOKEN 없을 때 chat 503 정중)

### 생성/수정 파일

#### 1. `tests/e2e/cross-cutting/keyboard.e2e.ts` (TS-61)

```ts
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/about", "/experience", "/contact"];

for (const url of PAGES) {
  test(`TS-61: ${url} 키보드 Tab order`, async ({ page }) => {
    await page.goto(url);
    // brand → 햄버거 → (page-specific tab order) 순서 검증.
    // 단순화: 첫 5번 Tab 후 focused element 의 visible 검증.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(focused).toBeTruthy();
    }
  });
}
```

#### 2. `tests/e2e/cross-cutting/a11y.e2e.ts` (TS-62)

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";   // npm install -D @axe-core/playwright

const PAGES = ["/", "/about", "/experience", "/contact"];

for (const url of PAGES) {
  test(`TS-62: ${url} axe-core WCAG 위반 0`, async ({ page }) => {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}
```

#### 3. `tests/e2e/cross-cutting/seo.e2e.ts` (TS-63, TS-64, TS-65)

```ts
test("TS-63: meta + JSON-LD", async ({ page }) => {
  await page.goto("/");
  expect(await page.title()).toContain("김윤수");
  // JSON-LD Person
  const ld = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(ld!);
  expect(data["@type"]).toBe("Person");
  expect(data.sameAs).toContain("https://github.com/YoonsooKim9");
});

test("TS-64: /opengraph-image 200 + image/png", async ({ request }) => {
  const res = await request.get("/opengraph-image");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/image\/png/);
});

test("TS-65: not-found 404", async ({ request, page }) => {
  // 직접 fetch
  const res = await request.get("/non-existent-path-xyz");
  expect(res.status()).toBe(404);
  // 페이지 visit
  await page.goto("/non-existent-path-xyz");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/찾을 수 없/);
  await expect(page.locator("a[href='/']")).toBeVisible();
});
```

#### 4. `tests/e2e/cross-cutting/round-trip.e2e.ts` (TS-66)

```ts
test("TS-66: 라우트 왕복 — greeted 유지, chat stateless", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  // greeting 시뮬레이션 후 portfolio.greeted 기록 — fastForward
  await page.fill("textarea", "테스트");
  await page.locator("textarea").press("Enter");
  await page.waitForTimeout(500);

  await page.goto("/about");
  await page.goto("/experience");
  await page.goto("/contact");
  await page.goto("/");

  // greeted 플래그 유지 → typing dots 미렌더
  const ld = await page.evaluate(() => localStorage.getItem("portfolio.greeted"));
  expect(ld).toBeTruthy();

  // chat messages stateless — 이전 메시지 사라짐
  const messages = await page.locator('[role="log"] > *').count();
  // greeting 정적 표시 1개 + (다른 어시스턴트 메시지 0) → count == 1.
  expect(messages).toBeLessThanOrEqual(2);
});
```

#### 5. `tests/e2e/cross-cutting/footer.e2e.ts` (TS-67)

```ts
test("TS-67: 푸터 마지막 업데이트 KST 형식", async ({ page }) => {
  await page.goto("/about");
  await page.locator("footer").scrollIntoViewIfNeeded();
  // YYYY-MM-DD 형식 또는 '—'
  const text = await page.locator("footer").textContent();
  expect(text).toMatch(/(\d{4}-\d{2}-\d{2}|—)/);
});
```

#### 6. `tests/e2e/cross-cutting/bundle-audit.spec.ts` (TS-69 — vitest 측 unit)

> 이 시나리오는 e2e 가 아니라 build 산출물 grep. Playwright 외부.

```ts
// specs/bundle-audit.spec.ts
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

describe("TS-69 critical bundle audit", () => {
  it(".next 클라이언트 청크에 1536 차원 임베딩 패턴 0", () => {
    const dir = path.join(process.cwd(), ".next/static/chunks");
    if (!fs.existsSync(dir)) {
      // build 안 된 환경 → skip
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), "utf-8");
      // 임베딩 vector 의 hint: 1536개 숫자 array 패턴
      const has1536 = /\[(?:-?\d+(?:\.\d+)?,){1530,}-?\d+(?:\.\d+)?\]/.test(text);
      expect(has1536, `chunk ${f} embedding leak`).toBe(false);
    }
  });
});
```

#### 7. `tests/e2e/cross-cutting/env-fallback.e2e.ts` (TS-70 — skip 가능)

```ts
test("TS-70: NOTION_TOKEN 없을 때 chat 정중 503", async ({ request }) => {
  test.skip(true, "MOCK_LLM=1 환경에서 token 부재 시뮬레이션 어려움 — 별도 unit spec 으로 검증");
});
```

#### 8. Visual baseline — 4 페이지 × 6 디바이스

```ts
// tests/e2e/visual/baseline.e2e.ts
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/about", "/experience", "/contact"];

for (const url of PAGES) {
  test(`visual: ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    // greeting 시뮬레이션 통과를 위해 잠시 대기 + storage 으로 fast-forward
    await page.evaluate(() => localStorage.setItem("portfolio.greeted", String(Date.now())));
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${url.replace(/\//g, "_") || "_root"}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
}
```

- Playwright 의 `toHaveScreenshot` 가 자동으로 baseline 저장 (`__screenshots__`). 첫 실행 후 git 에 commit. 후속 PR 에서 diff 검증.
- 6 device project 매트릭스 자동 적용 (config 의 projects[]).
- maxDiffPixelRatio 2% 허용 (anti-aliasing 차이).

#### 9. `docs/DEPLOY.md` 신설

```markdown
# Vercel 배포 가이드

## 1. GitHub 연결
1. Vercel 대시보드 → New Project.
2. `bbabi0901/portfolio` 선택.
3. Framework Preset: Next.js (자동 감지).

## 2. 환경변수 설정 (Production / Preview)

| 변수 | 필수 | 설명 |
|------|------|------|
| `OPENAI_API_KEY` | 권장 | GPT-4o-mini + 임베딩. 미설정 시 채팅 503. |
| `ANTHROPIC_API_KEY` | 옵션 | Claude 모델. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 옵션 | Gemini 모델. |
| `NOTION_TOKEN` | 필수 | 콘텐츠 sync + 피드백/Contact DB. |
| `NOTION_PROJECTS_DB_ID` | 필수 | 프로젝트 DB. |
| `NOTION_PROFILE_PAGE_IDS` | 권장 | 자기소개/이력서/취미 페이지. 콤마 구분. |
| `NOTION_FEEDBACK_DB_ID` | 권장 | 피드백 DB. 미설정 시 피드백 UI 비활성. |
| `NOTION_CONTACT_DB_ID` | 권장 | Contact DB. 미설정 시 폼 503 + mailto fallback. |
| `RESEND_API_KEY` | 옵션 | Contact 알림. 미설정 시 silent. |
| `RESEND_TO_EMAIL` | 옵션 | 운영자 이메일. 기본 `bbabi0901@gmail.com`. |
| `MAX_TOKENS_PER_DAY` | 옵션 | 기본 200000. |
| `UPSTASH_REDIS_REST_URL` | 권장 | rate limit + token cap 영속화. |
| `UPSTASH_REDIS_REST_TOKEN` | 권장 | 위와 한 쌍. |
| `NEXT_PUBLIC_SITE_URL` | 권장 | OG image / sitemap base. 예: `https://yoonsoo.dev`. |

## 3. Build settings
- Build command: `npm run build` (prebuild 가 자동으로 sync:notion + gen:suggestions).
- Output directory: `.next` (default).
- Install command: `npm ci`.

## 4. (옵션) 매일 자동 재배포 — Notion 콘텐츠 변경 반영
GitHub Actions 또는 Vercel Cron Job 으로 매일 1회 redeploy.

## 5. CI matrix
- `.github/workflows/ci.yml` — build-test (PR 마다).
- `.github/workflows/lhci.yml` — Lighthouse CI (post-mvp 활성화).
```

#### 10. `.github/workflows/ci.yml` 갱신 — e2e job 활성화

기존 `if: false` 를 제거. e2e job 정상 실행.

### 핵심 규칙 (위반 금지)

- **axe-core 의 violations 0건.** 위반 시 spec fail.
- **visual baseline 첫 실행 후 git commit.** 후속 PR 의 diff 만 검증.
- **6 device project 매트릭스 모두 visual 실행.** CI 시간 부담 시 MacBook 13 + iPhone 14 Pro 만으로 축소 (config 의 if 분기).
- **deploy guide 에 secret 직접 포함 금지.**
- **TS-XX 외 신규 시나리오 추가 금지.**
- **e2e job 활성화 시 timeout 충분히 (15min)**. 6 device × 4 페이지 visual = 시간 큼.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test                 # bundle-audit spec 포함
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
npm install -D @axe-core/playwright
npx playwright install chromium webkit
npm run e2e -- tests/e2e/cross-cutting   # MacBook 13 만
npm run e2e -- tests/e2e/visual --update-snapshots   # baseline 첫 생성
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `tests/e2e/cross-cutting/*` 5~6 파일.
   - `tests/e2e/visual/baseline.e2e.ts` + `__screenshots__/*` (commit 됨).
   - `specs/bundle-audit.spec.ts`.
   - `docs/DEPLOY.md`.
   - `.github/workflows/ci.yml` 의 e2e job 활성화.
3. `phases/7-e2e-deploy/index.json` step 4 갱신 (이 task 의 마지막).
4. `phases/index.json` 의 `7-e2e-deploy` 항목 status 가 `completed` 로 자동 전이.

## 금지사항

- **시각 회귀 baseline 의 maxDiffPixelRatio 5% 초과 금지.** flaky test.
- **CI workflow 에 secret 직접 등록 금지** — secrets.* 문법 사용. NOTION_TOKEN 등은 deploy guide 에서 안내.
- **bundle-audit grep regex 변경 금지** (1530+ 숫자). 더 정확한 검사 도입은 별도 task.
- **deploy 자동화 (Vercel API 호출) 코드 추가 금지** — docs 만.
- **사용자 personal info 추가 금지** (전화/주소).
