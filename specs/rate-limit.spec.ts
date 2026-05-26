import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/tests/msw/server";
import { checkRateLimit, clearRateLimitMemory, getClientIp, hashIp } from "@/lib/rate-limit";
import { clearEnvCache } from "@/lib/env";

const UPSTASH_URL = "https://test.upstash.io";
const UPSTASH_TOKEN = "secret-redis-token-xyz";

function clearUpstashEnv(): void {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.RATE_LIMIT_BYPASS;
  clearEnvCache();
}

describe("checkRateLimit (memory fallback)", () => {
  beforeEach(() => {
    clearRateLimitMemory();
    clearUpstashEnv();
  });

  it("limit=3 → 3회 ok, 4회째 deny + retryAfter > 0", async () => {
    const t0 = 1_700_000_000_000;
    const r1 = await checkRateLimit({ key: "k1", limit: 3, windowSeconds: 60, now: t0 });
    const r2 = await checkRateLimit({ key: "k1", limit: 3, windowSeconds: 60, now: t0 + 1 });
    const r3 = await checkRateLimit({ key: "k1", limit: 3, windowSeconds: 60, now: t0 + 2 });
    const r4 = await checkRateLimit({ key: "k1", limit: 3, windowSeconds: 60, now: t0 + 3 });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(r4.ok).toBe(false);
    if (!r4.ok) {
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfter).toBeGreaterThan(0);
      expect(r4.retryAfter).toBeLessThanOrEqual(60);
      expect(r4.resetAt).toBeGreaterThan(t0);
    }
  });

  it("ok 결과의 remaining 은 limit - 사용량", async () => {
    const t0 = 1_700_000_000_000;
    const r1 = await checkRateLimit({ key: "kr", limit: 5, windowSeconds: 60, now: t0 });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.remaining).toBe(4);
    const r2 = await checkRateLimit({ key: "kr", limit: 5, windowSeconds: 60, now: t0 + 10 });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.remaining).toBe(3);
  });

  it("windowSeconds 경과 후 다시 ok", async () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: "kw", limit: 3, windowSeconds: 60, now: t0 + i });
    }
    const denied = await checkRateLimit({ key: "kw", limit: 3, windowSeconds: 60, now: t0 + 4 });
    expect(denied.ok).toBe(false);
    const allowed = await checkRateLimit({
      key: "kw",
      limit: 3,
      windowSeconds: 60,
      now: t0 + 60_001,
    });
    expect(allowed.ok).toBe(true);
  });

  it("key 다르면 카운터가 격리됨", async () => {
    const t0 = 1_700_000_000_000;
    await checkRateLimit({ key: "kA", limit: 1, windowSeconds: 60, now: t0 });
    const denyA = await checkRateLimit({ key: "kA", limit: 1, windowSeconds: 60, now: t0 + 1 });
    const okB = await checkRateLimit({ key: "kB", limit: 1, windowSeconds: 60, now: t0 + 2 });
    expect(denyA.ok).toBe(false);
    expect(okB.ok).toBe(true);
  });

  it("LRU eviction: MAX_KEYS=5000 초과 시 오래된 키 제거", async () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5005; i++) {
      await checkRateLimit({ key: `lru-${i}`, limit: 1, windowSeconds: 60, now: t0 + i });
    }
    // The very first keys should have been evicted, so they can be ok again.
    const recovered = await checkRateLimit({
      key: "lru-0",
      limit: 1,
      windowSeconds: 60,
      now: t0 + 6000,
    });
    expect(recovered.ok).toBe(true);
  });

  it("RATE_LIMIT_BYPASS=1 → 항상 ok", async () => {
    process.env.RATE_LIMIT_BYPASS = "1";
    clearEnvCache();
    for (let i = 0; i < 50; i++) {
      const r = await checkRateLimit({ key: "kb", limit: 1, windowSeconds: 60, now: i });
      expect(r.ok).toBe(true);
    }
  });
});

describe("checkRateLimit (Upstash)", () => {
  beforeEach(() => {
    clearRateLimitMemory();
    process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
    delete process.env.RATE_LIMIT_BYPASS;
    clearEnvCache();
  });

  afterEach(() => {
    clearUpstashEnv();
  });

  it("정상 응답 ZCARD < limit → ok", async () => {
    server.use(
      http.post(`${UPSTASH_URL}/pipeline`, () =>
        HttpResponse.json([{ result: 0 }, { result: 1 }, { result: 1 }, { result: 1 }]),
      ),
    );
    const r = await checkRateLimit({ key: "u-ok", limit: 5, windowSeconds: 60 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(4);
  });

  it("ZCARD >= limit → deny + retryAfter > 0", async () => {
    server.use(
      http.post(`${UPSTASH_URL}/pipeline`, () =>
        HttpResponse.json([{ result: 0 }, { result: 1 }, { result: 5 }, { result: 1 }]),
      ),
    );
    const r = await checkRateLimit({ key: "u-deny", limit: 5, windowSeconds: 60 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.remaining).toBe(0);
      expect(r.retryAfter).toBeGreaterThan(0);
      expect(r.retryAfter).toBeLessThanOrEqual(60);
    }
  });

  it("Upstash Authorization 헤더와 pipeline 본문 검증", async () => {
    let received: { auth: string | null; body: unknown } | null = null;
    server.use(
      http.post(`${UPSTASH_URL}/pipeline`, async ({ request }) => {
        received = {
          auth: request.headers.get("authorization"),
          body: await request.json(),
        };
        return HttpResponse.json([{ result: 0 }, { result: 1 }, { result: 2 }, { result: 1 }]);
      }),
    );
    await checkRateLimit({ key: "u-headers", limit: 10, windowSeconds: 60, now: 9_000_000_000 });
    expect(received).not.toBeNull();
    expect(received!.auth).toBe(`Bearer ${UPSTASH_TOKEN}`);
    expect(Array.isArray(received!.body)).toBe(true);
    const cmds = received!.body as unknown[][];
    expect(cmds[0]?.[0]).toBe("ZREMRANGEBYSCORE");
    expect(cmds[1]?.[0]).toBe("ZADD");
    expect(cmds[2]?.[0]).toBe("ZCARD");
    expect(cmds[3]?.[0]).toBe("EXPIRE");
    // key prefix should be applied
    expect(String(cmds[2]?.[1])).toBe("rl:u-headers");
  });

  it("Upstash 5xx → 메모리 폴백 (ok 반환)", async () => {
    server.use(
      http.post(`${UPSTASH_URL}/pipeline`, () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await checkRateLimit({ key: "u-5xx", limit: 1, windowSeconds: 60 });
    expect(r.ok).toBe(true);
    warn.mockRestore();
  });

  it("Upstash 네트워크 에러 → 메모리 폴백", async () => {
    server.use(http.post(`${UPSTASH_URL}/pipeline`, () => HttpResponse.error()));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await checkRateLimit({ key: "u-net", limit: 1, windowSeconds: 60 });
    expect(r.ok).toBe(true);
    warn.mockRestore();
  });

  it("Upstash 5xx warn log 에 token 누설 X", async () => {
    server.use(
      http.post(`${UPSTASH_URL}/pipeline`, () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    const warns: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warns.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
    await checkRateLimit({ key: "u-leak", limit: 1, windowSeconds: 60 });
    for (const m of warns) {
      expect(m).not.toContain(UPSTASH_TOKEN);
    }
    expect(warns.length).toBeGreaterThan(0);
    warn.mockRestore();
  });
});

describe("getClientIp", () => {
  it("X-Forwarded-For 우선, 첫 IP 사용", () => {
    const req = new Request("https://x.com", {
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2",
        "cf-connecting-ip": "1.1.1.1",
        "x-real-ip": "10.0.0.5",
      },
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("CF-Connecting-IP", () => {
    const req = new Request("https://x.com", {
      headers: { "cf-connecting-ip": "203.0.113.9" },
    });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("X-Real-IP", () => {
    const req = new Request("https://x.com", {
      headers: { "x-real-ip": "203.0.113.5" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("부재 시 'unknown'", () => {
    const req = new Request("https://x.com");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("hashIp", () => {
  it("sha256 → 8 hex char", async () => {
    const h = await hashIp("203.0.113.7");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("동일 input → 동일 output (deterministic)", async () => {
    const a = await hashIp("203.0.113.7");
    const b = await hashIp("203.0.113.7");
    expect(a).toBe(b);
  });

  it("다른 input → 다른 output", async () => {
    const a = await hashIp("203.0.113.7");
    const b = await hashIp("198.51.100.4");
    expect(a).not.toBe(b);
  });
});
