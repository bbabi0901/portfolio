import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// FEAT-013: 접근성 자동 검증 — axe-core WCAG 2.0/2.1 A+AA 스캔 + 스킵 링크 키보드 내비게이션.
// anchor: axe (TS-62), keyboardNav (TS-61)

const PAGES = ["/", "/about", "/experience", "/contact", "/chat"] as const;

test.describe("axe: WCAG 2.0/2.1 AA 위반 0건 (TS-62)", () => {
  for (const path of PAGES) {
    test(`axe: ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.locator("main").waitFor();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target.join(" ")),
        })),
      ).toEqual([]);
    });
  }
});

test.describe("keyboardNav: 스킵 링크 (TS-61)", () => {
  test("keyboardNav: Tab 첫 포커스 = 스킵 링크, Enter 로 본문 이동", async ({
    page,
    browserName,
  }) => {
    // WebKit 은 기본 설정에서 Tab 이 링크에 포커스를 주지 않음 (Safari Option+Tab) — 사이트 결함 아님
    test.skip(browserName === "webkit", "WebKit Tab-to-link 기본 비활성");
    await page.goto("/about");
    await page.keyboard.press("Tab");
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator("main#main-content")).toBeVisible();
  });
});
