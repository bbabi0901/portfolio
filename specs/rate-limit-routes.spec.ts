import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { app as edgeApp } from "@/app/api/[[...route]]/route";
import { app as nodeApp } from "@/app/api/node/[[...route]]/route";
import { clearEnvCache } from "@/lib/env";
import {
  checkRateLimit,
  clearRateLimitMemory,
  hashIp,
} from "@/lib/rate-limit";

const validFeedbackBody = {
  messageId: "msg-rl",
  question: "rate limit test question?",
  answer: "rate limit test answer.",
  reason: "incomplete" as const,
  reasonDetail: "more please",
  model: "gpt-4o-mini",
  retrievalChunkTitles: [] as string[],
};

const ENV_KEYS = [
  "MOCK_LLM",
  "MOCK_NOTION",
  "OPENAI_API_KEY",
  "RATE_LIMIT_BYPASS",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

const original: Record<string, string | undefined> = {};

function applyDefaultEnv(): void {
  process.env.MOCK_LLM = "1";
  process.env.MOCK_NOTION = "1";
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.RATE_LIMIT_BYPASS;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  clearEnvCache();
}

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  clearRateLimitMemory();
  applyDefaultEnv();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
  clearRateLimitMemory();
});

async function postChat(headers: Record<string, string> = {}): Promise<Response> {
  return edgeApp.request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      messages: [{ role: "user", content: "샘플 프로젝트" }],
    }),
  });
}

async function postFeedback(
  headers: Record<string, string> = {},
): Promise<Response> {
  return nodeApp.request("/api/node/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(validFeedbackBody),
  });
}

async function postContact(
  headers: Record<string, string> = {},
): Promise<Response> {
  return nodeApp.request("/api/node/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ name: "x", email: "a@b.co", message: "hi there" }),
  });
}

describe("rateLimit /api/chat", () => {
  it("11회째 minute deny → 429 + Retry-After + scope=minute", async () => {
    for (let i = 0; i < 10; i++) {
      const ok = await postChat();
      expect(ok.status).toBe(200);
    }
    const denied = await postChat();
    expect(denied.status).toBe(429);
    const retry = denied.headers.get("Retry-After");
    expect(retry).not.toBeNull();
    expect(Number(retry)).toBeGreaterThan(0);
    expect(Number(retry)).toBeLessThanOrEqual(60);
    expect(denied.headers.get("X-RateLimit-Scope")).toBe("minute");
    const body = (await denied.json()) as { error: string; scope: string };
    expect(body.error).toBe("rate_limited");
    expect(body.scope).toBe("minute");
  });

  it("rate_limited 응답 본문에 IP/key 누설 X", async () => {
    const ip = "203.0.113.42";
    for (let i = 0; i < 10; i++) {
      const ok = await postChat({ "x-forwarded-for": ip });
      expect(ok.status).toBe(200);
    }
    const denied = await postChat({ "x-forwarded-for": ip });
    expect(denied.status).toBe(429);
    const text = await denied.text();
    expect(text).not.toContain(ip);
    // ip hash prefix should not be exposed either — validate that the
    // raw ip is absent and the body only carries `scope` + `error`.
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["error", "scope"]);
  });

  it("동일 IP 다른 라우트는 격리 (chat → feedback)", async () => {
    for (let i = 0; i < 10; i++) {
      const ok = await postChat();
      expect(ok.status).toBe(200);
    }
    const chatDeny = await postChat();
    expect(chatDeny.status).toBe(429);

    // Same default IP ("unknown") on /feedback should still be allowed.
    const feedbackOk = await postFeedback();
    expect(feedbackOk.status).toBe(200);
  });

  it("다른 IP 는 격리 (X-Forwarded-For)", async () => {
    const ipA = "203.0.113.10";
    const ipB = "198.51.100.20";
    for (let i = 0; i < 10; i++) {
      const ok = await postChat({ "x-forwarded-for": ipA });
      expect(ok.status).toBe(200);
    }
    const aDenied = await postChat({ "x-forwarded-for": ipA });
    expect(aDenied.status).toBe(429);

    const bOk = await postChat({ "x-forwarded-for": ipB });
    expect(bOk.status).toBe(200);
  });

  it("RATE_LIMIT_BYPASS=1 시 모두 ok (12회 200)", async () => {
    process.env.RATE_LIMIT_BYPASS = "1";
    clearEnvCache();
    for (let i = 0; i < 12; i++) {
      const r = await postChat();
      expect(r.status).toBe(200);
    }
  });
});

describe("rateLimit /api/node/feedback", () => {
  it("6회째 minute deny → 429 + scope=minute", async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await postFeedback();
      expect(ok.status).toBe(200);
    }
    const denied = await postFeedback();
    expect(denied.status).toBe(429);
    expect(denied.headers.get("X-RateLimit-Scope")).toBe("minute");
    const body = (await denied.json()) as { error: string; scope: string };
    expect(body.scope).toBe("minute");
  });

  it("31회째 day deny (사전 채움) → 429 + scope=day", async () => {
    // Pre-populate the day bucket to bypass the minute limit logic via direct
    // calls to checkRateLimit (same in-memory store).
    const ipHash = await hashIp("unknown");
    for (let i = 0; i < 30; i++) {
      const r = await checkRateLimit({
        key: `feedback:${ipHash}:d`,
        limit: 30,
        windowSeconds: 86_400,
      });
      expect(r.ok).toBe(true);
    }
    // Now the next request will pass minute (count=0) but fail day (count=30).
    const denied = await postFeedback();
    expect(denied.status).toBe(429);
    expect(denied.headers.get("X-RateLimit-Scope")).toBe("day");
    const body = (await denied.json()) as { error: string; scope: string };
    expect(body.scope).toBe("day");
    const retry = denied.headers.get("Retry-After");
    expect(retry).not.toBeNull();
    expect(Number(retry)).toBeGreaterThan(0);
  });

  it("다른 IP 는 격리", async () => {
    const ipA = "203.0.113.71";
    const ipB = "198.51.100.72";
    for (let i = 0; i < 5; i++) {
      const ok = await postFeedback({ "x-forwarded-for": ipA });
      expect(ok.status).toBe(200);
    }
    const aDenied = await postFeedback({ "x-forwarded-for": ipA });
    expect(aDenied.status).toBe(429);
    const bOk = await postFeedback({ "x-forwarded-for": ipB });
    expect(bOk.status).toBe(200);
  });
});

describe("rateLimit /api/node/contact", () => {
  it("4회째 minute deny → 429 + scope=minute", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await postContact();
      // /contact handler currently returns 501; rate limit middleware should
      // still allow the first 3 within the minute window.
      expect(r.status).toBe(501);
    }
    const denied = await postContact();
    expect(denied.status).toBe(429);
    expect(denied.headers.get("X-RateLimit-Scope")).toBe("minute");
  });

  it("11회째 day deny (사전 채움) → 429 + scope=day", async () => {
    const ipHash = await hashIp("unknown");
    for (let i = 0; i < 10; i++) {
      const r = await checkRateLimit({
        key: `contact:${ipHash}:d`,
        limit: 10,
        windowSeconds: 86_400,
      });
      expect(r.ok).toBe(true);
    }
    const denied = await postContact();
    expect(denied.status).toBe(429);
    expect(denied.headers.get("X-RateLimit-Scope")).toBe("day");
  });

  it("동일 IP 다른 라우트는 격리 (contact ≠ feedback)", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await postContact();
      expect(r.status).toBe(501);
    }
    const contactDeny = await postContact();
    expect(contactDeny.status).toBe(429);

    const feedbackOk = await postFeedback();
    expect(feedbackOk.status).toBe(200);
  });
});
