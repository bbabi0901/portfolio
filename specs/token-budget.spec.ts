import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/tests/msw/server";
import { app as edgeApp } from "@/app/api/[[...route]]/route";
import { clearEnvCache } from "@/lib/env";
import { clearRateLimitMemory } from "@/lib/rate-limit";
import {
  addTokenUsage,
  checkDailyTokenBudget,
  clearTokenBudgetMemory,
  getKstDayKey,
  getTodayUsage,
} from "@/lib/token-budget";

const UPSTASH_URL = "https://test.upstash.io";
const UPSTASH_TOKEN = "secret-tk-token-xyz";

const ENV_KEYS = [
  "MAX_TOKENS_PER_DAY",
  "RATE_LIMIT_BYPASS",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "MOCK_LLM",
  "MOCK_NOTION",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

const original: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  for (const k of ENV_KEYS) original[k] = process.env[k];
}

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
}

function clearAll(): void {
  for (const k of ENV_KEYS) delete process.env[k];
  clearEnvCache();
  clearTokenBudgetMemory();
  clearRateLimitMemory();
}

describe("getKstDayKey", () => {
  it("UTC 14:00 → KST 23:00 → '2026-05-07'", () => {
    const ms = Date.UTC(2026, 4, 7, 14, 0, 0);
    expect(getKstDayKey(ms)).toBe("tk:2026-05-07");
  });

  it("UTC 15:00 → KST 00:00 → '2026-05-08'", () => {
    const ms = Date.UTC(2026, 4, 7, 15, 0, 0);
    expect(getKstDayKey(ms)).toBe("tk:2026-05-08");
  });

  it("UTC 14:59:59 → 같은 KST 일자, UTC 15:00 → 다음 일자", () => {
    const before = Date.UTC(2026, 4, 7, 14, 59, 59);
    const after = Date.UTC(2026, 4, 7, 15, 0, 0);
    expect(getKstDayKey(before)).toBe("tk:2026-05-07");
    expect(getKstDayKey(after)).toBe("tk:2026-05-08");
  });

  it("월말 KST 자정 경계 (UTC 2026-05-31T15:00 → KST 2026-06-01)", () => {
    const ms = Date.UTC(2026, 4, 31, 15, 0, 0);
    expect(getKstDayKey(ms)).toBe("tk:2026-06-01");
  });
});

describe("token budget (memory)", () => {
  beforeEach(() => {
    snapshotEnv();
    clearAll();
    process.env.MAX_TOKENS_PER_DAY = "1000";
  });

  afterEach(() => {
    restoreEnv();
    clearTokenBudgetMemory();
  });

  it("초기 사용량 0, ok=true", async () => {
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    const used = await getTodayUsage(now);
    expect(used).toBe(0);
    const res = await checkDailyTokenBudget(now);
    expect(res.ok).toBe(true);
    expect(res.used).toBe(0);
    expect(res.cap).toBe(1000);
    expect(res.resetAt).toBeGreaterThan(now);
  });

  it("addTokenUsage 후 누적", async () => {
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    await addTokenUsage({ promptTokens: 200, completionTokens: 100 }, now);
    expect(await getTodayUsage(now)).toBe(300);
    await addTokenUsage({ promptTokens: 50, completionTokens: 50 }, now);
    expect(await getTodayUsage(now)).toBe(400);
    const res = await checkDailyTokenBudget(now);
    expect(res.ok).toBe(true);
    expect(res.used).toBe(400);
  });

  it("cap 초과 → ok=false + resetAt 자정 KST", async () => {
    const now = Date.UTC(2026, 4, 7, 6, 0, 0); // KST 2026-05-07 15:00
    await addTokenUsage({ promptTokens: 600, completionTokens: 400 }, now);
    expect(await getTodayUsage(now)).toBe(1000);
    const res = await checkDailyTokenBudget(now);
    expect(res.ok).toBe(false);
    expect(res.used).toBe(1000);
    expect(res.cap).toBe(1000);
    // KST midnight after now = 2026-05-08 00:00 KST = 2026-05-07 15:00 UTC
    expect(res.resetAt).toBe(Date.UTC(2026, 4, 7, 15, 0, 0));
  });

  it("MAX_TOKENS_PER_DAY=0 → 즉시 cap (used 0 도 deny)", async () => {
    process.env.MAX_TOKENS_PER_DAY = "0";
    clearEnvCache();
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    const res = await checkDailyTokenBudget(now);
    expect(res.ok).toBe(false);
    expect(res.cap).toBe(0);
    expect(res.used).toBe(0);
  });

  it("RATE_LIMIT_BYPASS=1 → 항상 ok=true + used=0", async () => {
    process.env.RATE_LIMIT_BYPASS = "1";
    clearEnvCache();
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    // 누적해도 무시되어야 함
    await addTokenUsage({ promptTokens: 5000, completionTokens: 5000 }, now);
    const used = await getTodayUsage(now);
    expect(used).toBe(0);
    const res = await checkDailyTokenBudget(now);
    expect(res.ok).toBe(true);
    expect(res.used).toBe(0);
  });

  it("KST 자정 경과 → 새 day key, used=0", async () => {
    const day1 = Date.UTC(2026, 4, 7, 6, 0, 0); // KST 5/7 15:00
    const day2 = Date.UTC(2026, 4, 7, 16, 0, 0); // KST 5/8 01:00 (다음날)
    expect(getKstDayKey(day1)).toBe("tk:2026-05-07");
    expect(getKstDayKey(day2)).toBe("tk:2026-05-08");
    await addTokenUsage({ promptTokens: 100, completionTokens: 100 }, day1);
    expect(await getTodayUsage(day1)).toBe(200);
    expect(await getTodayUsage(day2)).toBe(0);
  });

  it("음수/NaN usage 방어 (clamp)", async () => {
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    await addTokenUsage(
      { promptTokens: -50 as number, completionTokens: 100 },
      now,
    );
    // negative should not bring total below 0
    const used = await getTodayUsage(now);
    expect(used).toBeGreaterThanOrEqual(0);
  });
});

describe("token budget (Upstash)", () => {
  beforeEach(() => {
    snapshotEnv();
    clearAll();
    process.env.MAX_TOKENS_PER_DAY = "1000";
    process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
    clearEnvCache();
  });

  afterEach(() => {
    restoreEnv();
    clearTokenBudgetMemory();
  });

  it("getTodayUsage 가 GET 호출하고 number 반환", async () => {
    let received: { auth: string | null; url: string } | null = null;
    server.use(
      http.get(`${UPSTASH_URL}/get/:key`, ({ request, params }) => {
        received = {
          auth: request.headers.get("authorization"),
          url: String(params.key),
        };
        return HttpResponse.json({ result: "300" });
      }),
    );
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    const used = await getTodayUsage(now);
    expect(used).toBe(300);
    expect(received).not.toBeNull();
    expect(received!.auth).toBe(`Bearer ${UPSTASH_TOKEN}`);
    expect(received!.url).toBe("tk:2026-05-07");
  });

  it("addTokenUsage 가 INCRBY + EXPIRE pipeline 호출", async () => {
    let received: { auth: string | null; body: unknown } | null = null;
    server.use(
      http.post(`${UPSTASH_URL}/pipeline`, async ({ request }) => {
        received = {
          auth: request.headers.get("authorization"),
          body: await request.json(),
        };
        return HttpResponse.json([{ result: 300 }, { result: 1 }]);
      }),
    );
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    await addTokenUsage({ promptTokens: 200, completionTokens: 100 }, now);
    expect(received).not.toBeNull();
    expect(received!.auth).toBe(`Bearer ${UPSTASH_TOKEN}`);
    const cmds = received!.body as unknown[][];
    expect(Array.isArray(cmds)).toBe(true);
    expect(cmds[0]?.[0]).toBe("INCRBY");
    expect(String(cmds[0]?.[1])).toBe("tk:2026-05-07");
    expect(String(cmds[0]?.[2])).toBe("300");
    expect(cmds[1]?.[0]).toBe("EXPIRE");
    expect(String(cmds[1]?.[1])).toBe("tk:2026-05-07");
    // EXPIRE 가 누락되지 않고 양수
    expect(Number(cmds[1]?.[2])).toBeGreaterThan(0);
  });

  it("Upstash 5xx → 메모리 폴백 + warn log", async () => {
    server.use(
      http.get(`${UPSTASH_URL}/get/:key`, () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
      http.post(`${UPSTASH_URL}/pipeline`, () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = Date.UTC(2026, 4, 7, 6, 0, 0);
    await addTokenUsage({ promptTokens: 100, completionTokens: 100 }, now);
    const used = await getTodayUsage(now);
    // upstream fails for both → memory should still hold the increment
    expect(used).toBe(200);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("Upstash 5xx warn 로그에 token 누설 X", async () => {
    server.use(
      http.post(`${UPSTASH_URL}/pipeline`, () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    const warns: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warns.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
    await addTokenUsage({ promptTokens: 10, completionTokens: 10 });
    for (const m of warns) {
      expect(m).not.toContain(UPSTASH_TOKEN);
    }
    warn.mockRestore();
  });
});

describe("/api/chat 토큰 cap 통합", () => {
  beforeEach(() => {
    snapshotEnv();
    clearAll();
    process.env.MAX_TOKENS_PER_DAY = "100";
    process.env.MOCK_LLM = "1";
    process.env.OPENAI_API_KEY = "sk-test";
    clearEnvCache();
  });

  afterEach(() => {
    restoreEnv();
    clearTokenBudgetMemory();
    clearRateLimitMemory();
  });

  async function postChat(): Promise<Response> {
    return edgeApp.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "샘플 프로젝트" }],
      }),
    });
  }

  it("cap 초과 (used 100, +1) → 503 + Retry-After", async () => {
    // pre-populate today's usage to match the cap
    await addTokenUsage({ promptTokens: 60, completionTokens: 40 });
    const res = await postChat();
    expect(res.status).toBe(503);
    const retry = res.headers.get("Retry-After");
    expect(retry).not.toBeNull();
    expect(Number(retry)).toBeGreaterThan(0);
    const body = (await res.json()) as Record<string, unknown>;
    // body must NOT echo `used` or `cap`
    expect(body.used).toBeUndefined();
    expect(body.cap).toBeUndefined();
    expect(body.error).toBeDefined();
  });

  it("정상 응답 후 addTokenUsage 호출 (used 누적)", async () => {
    process.env.MAX_TOKENS_PER_DAY = "10000";
    clearEnvCache();
    const before = await getTodayUsage();
    const res = await postChat();
    expect(res.status).toBe(200);
    await res.text();
    const after = await getTodayUsage();
    expect(after).toBeGreaterThan(before);
  });

  it("503 응답 본문에 사용량/cap echo back 금지", async () => {
    await addTokenUsage({ promptTokens: 100, completionTokens: 0 });
    const res = await postChat();
    expect(res.status).toBe(503);
    const text = await res.text();
    // raw body should not contain the literal "100" used count or any token leak.
    // We assert structure: only `error` field allowed (and optionally a stable code).
    const body = JSON.parse(text) as Record<string, unknown>;
    const allowed = new Set(["error"]);
    for (const k of Object.keys(body)) {
      expect(allowed.has(k)).toBe(true);
    }
    // headers also must not leak remaining
    expect(res.headers.get("X-Token-Budget-Remaining")).toBeNull();
    expect(res.headers.get("X-Token-Budget-Used")).toBeNull();
  });
});
