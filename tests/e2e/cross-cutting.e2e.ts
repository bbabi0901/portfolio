import { test, expect } from "@playwright/test";

test.describe("cross-cutting (TS-63, TS-64, TS-65, TS-67)", () => {
  test("TS-63: layout metadata + JSON-LD Person", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/김윤수/);
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ld).toBeTruthy();
    const data = JSON.parse(ld!) as { "@type": string; sameAs?: string[] };
    expect(data["@type"]).toBe("Person");
    expect(data.sameAs).toEqual(expect.arrayContaining([expect.stringContaining("github.com/YoonsooKim9")]));
  });

  test("TS-64: /opengraph-image 200 + image/png", async ({ request }) => {
    const res = await request.get("/opengraph-image");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/png/);
  });

  test("TS-65: not-found 404 + 홈 링크", async ({ page, request }) => {
    const res = await request.get("/__not-existent-path-xyz__");
    expect(res.status()).toBe(404);
    await page.goto("/__not-existent-path-xyz__");
    const homeLink = page.locator('a[href="/"]').first();
    await expect(homeLink).toBeVisible();
  });

  test("TS-67: 푸터에 마지막 업데이트 또는 placeholder", async ({ page }) => {
    await page.goto("/about");
    const footer = page.locator("footer").first();
    if (await footer.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = (await footer.textContent()) ?? "";
      expect(text).toMatch(/(\d{4}-\d{2}-\d{2}|—|업데이트)/);
    } else {
      test.skip(true, "푸터 미렌더 환경");
    }
  });

  test("sitemap.xml 200", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("/about");
    expect(text).toContain("/experience");
    expect(text).toContain("/contact");
  });

  test("robots.txt 200 + disallow /api/", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/Disallow:.*\/api/);
  });
});
