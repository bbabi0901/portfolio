import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";

import { app } from "@/app/api/node/[[...route]]/route";
import { server } from "@/tests/msw/server";
import { clearEnvCache } from "@/lib/env";
import { clearRateLimitMemory } from "@/lib/rate-limit";

const ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_CONTACT_DB_ID",
  "RESEND_API_KEY",
  "RESEND_TO_EMAIL",
  "MOCK_NOTION",
] as const;

const original: Record<string, string | undefined> = {};

const validBody = {
  name: "홍길동",
  email: "hong@example.com",
  message: "안녕하세요. 협업 문의드립니다.",
  website: "",
  elapsedMs: 2000,
};

function setRealNotionEnv(): void {
  process.env.NOTION_TOKEN = "secret_test_token";
  process.env.NOTION_CONTACT_DB_ID = "contact_db_id_test";
  delete process.env.MOCK_NOTION;
  delete process.env.RESEND_API_KEY;
  clearEnvCache();
}

async function postContact(
  body: unknown,
  opts: { headers?: Record<string, string>; bodyAsString?: string } = {},
): Promise<Response> {
  return app.request("/api/node/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.bodyAsString ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  clearEnvCache();
  clearRateLimitMemory();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
  server.resetHandlers();
});

describe("POST /api/node/contact - honeypot", () => {
  beforeEach(() => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
  });

  it("200 _silent: website 필드가 채워지면 조용히 성공 반환 (저장 안 함)", async () => {
    const res = await postContact({ ...validBody, website: "https://bot.example.com" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; _silent?: boolean };
    expect(body.ok).toBe(true);
    expect(body._silent).toBe(true);
  });
});

describe("POST /api/node/contact - speed check", () => {
  beforeEach(() => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
  });

  it("422 too_fast: elapsedMs < 1500", async () => {
    const res = await postContact({ ...validBody, elapsedMs: 500 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("too_fast");
  });

  it("200: elapsedMs === 1500 는 통과", async () => {
    const res = await postContact({ ...validBody, elapsedMs: 1500 });
    expect(res.status).toBe(200);
  });

  it("200: elapsedMs 미입력 시 체크 안 함", async () => {
    const { elapsedMs: _omit, ...rest } = validBody;
    void _omit;
    const res = await postContact(rest);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/node/contact - mock 모드", () => {
  beforeEach(() => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
  });

  it("200: ok=true + channel=notion (MOCK 모드)", async () => {
    const res = await postContact(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; channel: string };
    expect(body.ok).toBe(true);
    expect(body.channel).toBe("notion");
  });
});

describe("POST /api/node/contact - real notion (msw)", () => {
  beforeEach(() => {
    setRealNotionEnv();
  });

  it("200: 정상 응답 → ok=true + channel=notion", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ id: "contact-page-1" }),
      ),
    );
    const res = await postContact(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; channel: string };
    expect(body.ok).toBe(true);
    expect(body.channel).toBe("notion");
  });

  it("503 contact_not_configured: NOTION_CONTACT_DB_ID 없을 때", async () => {
    delete process.env.NOTION_CONTACT_DB_ID;
    clearEnvCache();
    const res = await postContact(validBody);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; mailto: string };
    expect(body.error).toBe("contact_not_configured");
    expect(body.mailto).toBe("mailto:bbabi0901@gmail.com");
  });

  it("503 contact_not_configured: NOTION_TOKEN 없을 때", async () => {
    delete process.env.NOTION_TOKEN;
    clearEnvCache();
    const res = await postContact(validBody);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; mailto: string };
    expect(body.error).toBe("contact_not_configured");
    expect(body.mailto).toBe("mailto:bbabi0901@gmail.com");
  });

  it("502 contact_failed: Notion 실패 + RESEND 없을 때", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () => new HttpResponse("boom", { status: 500 })),
    );
    const res = await postContact(validBody);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; mailto: string };
    expect(body.error).toBe("contact_failed");
    expect(body.mailto).toBe("mailto:bbabi0901@gmail.com");
  });

  it("200 channel=resend: Notion 실패 + RESEND 설정 있을 때", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_TO_EMAIL = "owner@example.com";
    clearEnvCache();
    server.use(
      http.post("https://api.notion.com/v1/pages", () => new HttpResponse("boom", { status: 500 })),
      http.post("https://api.resend.com/emails", () => HttpResponse.json({ id: "resend-1" })),
    );
    const res = await postContact(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; channel: string };
    expect(body.ok).toBe(true);
    expect(body.channel).toBe("resend");
  });

  it("400: 잘못된 JSON", async () => {
    const res = await postContact(undefined, { bodyAsString: "{not json" });
    expect(res.status).toBe(400);
  });

  it("400: name 누락", async () => {
    const { name: _omit, ...rest } = validBody;
    void _omit;
    const res = await postContact(rest);
    expect(res.status).toBe(400);
  });

  it("400: 잘못된 email", async () => {
    const res = await postContact({ ...validBody, email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("400: message 너무 짧음 (10자 미만)", async () => {
    const res = await postContact({ ...validBody, message: "짧아요" });
    expect(res.status).toBe(400);
  });
});
