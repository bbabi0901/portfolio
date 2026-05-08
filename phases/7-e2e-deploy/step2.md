# Step 2: e2e-side-menu

## 읽어야 할 파일

- `/docs/TEST_SCENARIOS.md` — TS-23~32 사이드 메뉴 시나리오.
- `/spec.json` — `testScenarios[]` TS-23~32 매핑.
- `/components/layout/{Header,SideSheet,SideMenuItem,Footer,LayoutClient}.tsx`.
- `/tests/e2e/utils/test-helpers.ts` — `openSideMenu` helper (이전 step 0).

## 작업

햄버거 / 사이드 메뉴 시나리오 e2e. 단일 spec 파일 또는 `tests/e2e/side-menu.e2e.ts`.

### 시나리오 매핑

- **TS-23** 햄버거 → 시트 열림 (focus trap, 첫 항목 focus)
- **TS-24** ESC 닫기 + 햄버거 focus 복귀
- **TS-25** overlay 클릭 닫기
- **TS-26** 메뉴 항목 클릭 → 라우트 이동 + 자동 close (4 메뉴 모두)
- **TS-27** 키보드 화살표 네비게이션
- **TS-28** 모바일 풀스크린 vs 데스크톱 사이드 패널 (visual — 대조 검증)
- **TS-29** route 변경 시 자동 close (브라우저 뒤로 가기)
- **TS-30** 가로 회전 (모바일 viewport rotate)
- **TS-31** 빠른 햄버거 toggle 연타 (debounce)
- **TS-32** Reduced motion (애니메이션 0)

### TDD 순서

1. spec.json testScenarios[] 매핑 확인 (file 경로 일치).
2. e2e 작성.

### 핵심 동작

```ts
import { test, expect } from "@playwright/test";

test.describe("side menu (TS-23~32)", () => {
  test("TS-23: 햄버거 클릭 → 시트 열림 + 첫 메뉴 focus", async ({ page }) => {
    await page.goto("/");
    await page.locator('[aria-label="메뉴 열기"]').click();
    // SheetContent dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    // 4 메뉴 항목
    await expect(dialog.locator("a[href='/']")).toBeVisible();
    await expect(dialog.locator("a[href='/about']")).toBeVisible();
    await expect(dialog.locator("a[href='/experience']")).toBeVisible();
    await expect(dialog.locator("a[href='/contact']")).toBeVisible();
    // 첫 항목 자동 focus
    await expect(dialog.locator("a[href='/']").first()).toBeFocused();
  });

  test("TS-24: ESC → 시트 닫힘 + 햄버거 focus 복귀", async ({ page }) => { /* … */ });

  test("TS-25: overlay 클릭 → 닫힘", async ({ page }) => { /* … */ });

  test.describe("TS-26: 메뉴 항목 → 라우트 이동 + auto close", () => {
    for (const { href, label } of [
      { href: "/about", label: "자기소개" },
      { href: "/experience", label: "기술 이력" },
      { href: "/contact", label: "연락하기" },
    ]) {
      test(`${label} 메뉴`, async ({ page }) => {
        await page.goto("/");
        await page.locator('[aria-label="메뉴 열기"]').click();
        await page.locator(`a[href="${href}"]`).click();
        await expect(page).toHaveURL(href);
        await expect(page.locator('[role="dialog"]')).toBeHidden();
      });
    }
  });

  test("TS-27: 화살표 키로 메뉴 이동", async ({ page }) => { /* … */ });

  test("TS-28: 모바일 풀스크린 (375px) vs 데스크톱 320px (1280px)", async ({ browser }) => {
    // 두 context 로 비교
  });

  test("TS-29: 브라우저 뒤로 가기 → 시트 자동 close", async ({ page }) => { /* … */ });

  test("TS-30: 가로 회전 시뮬레이션", async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    /* … */
  });

  test("TS-31: 80ms 미만 햄버거 연타 → 마지막 상태", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator('[aria-label=/메뉴 (열기|닫기)/]');
    await trigger.click();
    await trigger.click();
    await trigger.click();
    // 100ms 이상 wait 후 최종 상태
    await page.waitForTimeout(150);
    /* assert */
  });

  test("TS-32: prefers-reduced-motion → 즉시 표시", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    /* … */
  });
});
```

### 핵심 규칙 (위반 금지)

- **focus trap 검증은 Tab 키로 dialog 안 순환 확인**. 외부 element 로 focus 가 빠지지 않아야.
- **route 변경 → SideSheet 자동 close** 은 usePathname 기반. 검증 시 URL change + dialog hidden.
- **viewport rotate 는 setViewportSize 만으로 충분**. 실제 device orientation 이벤트는 Playwright 기본 지원 X.
- **TS-28 visual 비교는 step 4 (visual baseline) 의 책임**. 이 step 에서는 단순 visible / hidden 검증만.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
npm run e2e -- --project="MacBook 13" tests/e2e/side-menu.e2e.ts
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `tests/e2e/side-menu.e2e.ts` 존재 + 10 시나리오 통과.
   - regress: chat e2e 모두 통과.
3. `phases/7-e2e-deploy/index.json` step 2 갱신.

## 금지사항

- **chat / page 시나리오 추가 금지.**
- **외부 device emulation 라이브러리 금지** — Playwright 기본만.
- **시트 내부 DOM 직접 mutation 금지** — Playwright keyboard / click 만.
- **TS-XX 외 새 시나리오 추가 금지.** spec.json testScenarios[] SSoT.
