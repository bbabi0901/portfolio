import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { logUnansweredQuestion } from "@/services/notion-unanswered";
import { clearEnvCache } from "@/lib/env";

const KEYS = ["NOTION_TOKEN", "NOTION_UNANSWERED_DB_ID"] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) original[k] = process.env[k];
  process.env.NOTION_TOKEN = "secret_test";
  process.env.NOTION_UNANSWERED_DB_ID = "db-123";
  clearEnvCache();
});

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
  vi.restoreAllMocks();
});

// TS-102 (FEAT-043) — 미답변 질문 노션 수집: 무해성(fire-and-forget) 계약
describe("logUnansweredQuestion (TS-102)", () => {
  it("성공 — 질문이 title 로, 대상 DB 로 기록되고 true", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const ok = await logUnansweredQuestion("연봉이 얼마예요?", { fetchFn });
    expect(ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain("notion");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.parent.database_id).toBe("db-123");
    expect(body.properties["질문"].title[0].text.content).toBe("연봉이 얼마예요?");
  });

  it("NOTION_UNANSWERED_DB_ID 미설정 — fetch 없이 false (no-op)", async () => {
    delete process.env.NOTION_UNANSWERED_DB_ID;
    clearEnvCache();
    const fetchFn = vi.fn();
    expect(await logUnansweredQuestion("q", { fetchFn })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetch 실패/네트워크 예외 — throw 하지 않고 false (응답 무해)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await logUnansweredQuestion("q", { fetchFn })).toBe(false);
  });

  it("200자 초과 질문은 절단해 기록", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await logUnansweredQuestion("가".repeat(500), { fetchFn });
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.properties["질문"].title[0].text.content.length).toBe(200);
  });
});
