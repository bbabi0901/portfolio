import { test, expect } from "@playwright/test";

test.describe("e2e fixtures", () => {
  // 테마는 시스템 자동 — dark 클래스 검증을 위해 다크 스킴 고정
  test.use({ colorScheme: "dark" });

  test("api/health responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.runtime).toBe("nodejs");
  });

  test("home renders with html lang=ko + dark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
