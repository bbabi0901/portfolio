import { test, expect } from "@playwright/test";

test.describe("e2e fixtures", () => {
  test("api/health responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.runtime).toBe("edge");
  });

  test("home renders with html lang=ko + dark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
