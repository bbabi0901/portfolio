import { test, expect, type Page } from "@playwright/test";

// FEAT-028 반응형 디자인 시스템 — 프로젝트 매트릭스(360~2560px) 전체에서 실행된다.
// 핵심 불변식: 어떤 뷰포트에서도 가로 오버플로우(수평 스크롤) 없음 + 주요 랜드마크 렌더.
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "가로 오버플로우(px)").toBeLessThanOrEqual(1);
}

test.describe("breakpoints (TS-28, TS-37, TS-42)", () => {
  test("TS-28: 홈 — 전 뷰포트 가로 오버플로우 없음 + main 렌더", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("TS-37: /about — 전 뷰포트 가로 오버플로우 없음 + main 렌더", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("TS-42: /experience — 전 뷰포트 가로 오버플로우 없음 + 타임라인 렌더", async ({ page }) => {
    await page.goto("/experience");
    await expect(page.getByRole("heading", { name: "커리어 타임라인" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
