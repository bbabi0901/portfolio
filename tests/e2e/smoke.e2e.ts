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
    expect(body.runtime).toBe("nodejs");
  });
});
