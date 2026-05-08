import { test, expect } from "@playwright/test";
import { skipGreeting, openSideMenu } from "./utils/test-helpers";

test.describe("side menu (TS-23~26, TS-29)", () => {
  test.beforeEach(async ({ page }) => {
    await skipGreeting(page);
  });

  test("TS-23: 햄버거 → 시트 열림 + 4 메뉴 항목", async ({ page }) => {
    await page.goto("/");
    await openSideMenu(page);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: /대화/ })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /자기소개/ })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /기술 이력/ })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /연락하기/ })).toBeVisible();
  });

  test("TS-24: ESC → 시트 닫힘", async ({ page }) => {
    await page.goto("/");
    await openSideMenu(page);
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toBeHidden();
  });

  test("TS-26: '자기소개' 클릭 → /about + 시트 자동 close", async ({ page }) => {
    await page.goto("/");
    await openSideMenu(page);
    await page.locator('[role="dialog"]').getByRole("link", { name: /자기소개/ }).click();
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator('[role="dialog"]')).toBeHidden();
  });

  test("TS-26: '기술 이력' 클릭 → /experience", async ({ page }) => {
    await page.goto("/");
    await openSideMenu(page);
    await page.locator('[role="dialog"]').getByRole("link", { name: /기술 이력/ }).click();
    await expect(page).toHaveURL(/\/experience/);
  });

  test("TS-26: '연락하기' 클릭 → /contact", async ({ page }) => {
    await page.goto("/");
    await openSideMenu(page);
    await page.locator('[role="dialog"]').getByRole("link", { name: /연락하기/ }).click();
    await expect(page).toHaveURL(/\/contact/);
  });

  test("TS-29: 라우트 변경 시 시트 자동 close (브라우저 back)", async ({ page }) => {
    await page.goto("/");
    await page.goto("/about");
    await openSideMenu(page);
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.goBack();
    await expect(page.locator('[role="dialog"]')).toBeHidden();
  });
});
