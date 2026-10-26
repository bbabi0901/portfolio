import type { Page } from "@playwright/test";

/** Greeting 시뮬레이션을 fast-forward 하기 위해 storage 에 'greeted' 기록을 사전 주입. */
export async function skipGreeting(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("portfolio.greeted", String(Date.now()));
    } catch {
      /* ignore */
    }
  });
}

/** React hydration 완료 대기 — hydration 전 DOM 직접 조작은 controlled 값으로 덮어써진다. */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  }, selector);
}

/** 사용자 메시지 전송. textarea fill + Enter. */
export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const ta = page.locator("textarea").first();
  await ta.fill(text);
  await ta.press("Enter");
}

/** 사이드 메뉴 열기 (햄버거 클릭). */
export async function openSideMenu(page: Page): Promise<void> {
  await page.locator('[aria-label="메뉴 열기"]').click();
}

/** 마지막 어시스턴트 메시지 텍스트 추출. */
export async function getLastAssistantText(page: Page): Promise<string> {
  const messages = page
    .locator('[role="log"] [data-role="assistant"], [role="log"] article')
    .last();
  return (await messages.textContent()) ?? "";
}
