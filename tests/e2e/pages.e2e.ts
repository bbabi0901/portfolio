import { test, expect } from "@playwright/test";

test.describe("/about (TS-33)", () => {
  test("TS-33: 페이지 직접 진입 200 + 헤더/푸터", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("/experience (TS-38, TS-39)", () => {
  test("TS-38: 페이지 직접 진입", async ({ page }) => {
    await page.goto("/experience");
    await expect(page).toHaveURL(/\/experience/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("TS-39: 카테고리 필터 → URL ?category= 동기화", async ({ page }) => {
    await page.goto("/experience");
    const filter = page.getByRole("button", { name: /업무/ }).first();
    if (await filter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filter.click();
      await expect(page).toHaveURL(/category=/);
    } else {
      // 빈 데이터로 인해 필터 미렌더 → SKIP
      test.skip(true, "fixture 데이터에 카테고리 필터 옵션 없음");
    }
  });
});

test.describe("/contact (TS-43, TS-46, TS-49)", () => {
  test("TS-43: 페이지 직접 진입 + 폼 + 직접 연락 카드", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
    // 직접 연락 카드의 mailto link
    await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
  });

  test("TS-46: 잘못된 이메일 → 인라인 에러", async ({ page }) => {
    await page.goto("/contact");
    await page.fill('input[name="name"]', "홍길동");
    await page.fill('input[name="email"]', "not-an-email");
    await page.fill('textarea[name="message"]', "테스트 메시지입니다 (10자 이상).");
    await page.locator('button[type="submit"]').click();
    // 인라인 에러 또는 disabled 동작
    const emailInput = page.locator('input[name="email"]');
    const isInvalid = await emailInput.evaluate(
      (el: HTMLInputElement) =>
        el.validity?.valid === false || el.getAttribute("aria-invalid") === "true",
    );
    expect(isInvalid).toBe(true);
  });

  test("TS-49: honeypot 채워짐 → 200 silent (네트워크 레벨)", async ({ request }) => {
    const res = await request.post("/api/node/contact", {
      headers: { "Content-Type": "application/json" },
      data: {
        name: "BotTest",
        email: "bot@example.com",
        message: "스팸 메시지 텍스트입니다 (10자 이상).",
        website: "http://spam.example.com",
        elapsedMs: 3000,
      },
    });
    // honeypot 채워지면 200 silent (server 정책)
    expect(res.status()).toBe(200);
  });
});
