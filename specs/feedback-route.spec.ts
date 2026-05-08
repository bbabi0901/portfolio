import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";

import { app } from "@/app/api/node/[[...route]]/route";
import { server } from "@/tests/msw/server";
import { clearEnvCache } from "@/lib/env";
import { clearRateLimitMemory } from "@/lib/rate-limit";

const ENV_KEYS = [
  "NOTION_TOKEN",
  "NOTION_FEEDBACK_DB_ID",
  "MOCK_NOTION",
] as const;

const original: Record<string, string | undefined> = {};

const validBody = {
  messageId: "msg-feedback-1",
  question: "Module Federation 어떻게 적용했나요?",
  answer: "MFE 마이그레이션 TF에서 Vite 기반으로 적용했습니다.",
  reason: "incomplete" as const,
  reasonDetail: "더 자세히 알고 싶어요",
  model: "gpt-4o-mini",
  retrievalChunkTitles: ["MFE TF", "Bidirectional Federation"],
};

function setRealNotionEnv(): void {
  process.env.NOTION_TOKEN = "secret_test_token";
  process.env.NOTION_FEEDBACK_DB_ID = "db_id_test";
  delete process.env.MOCK_NOTION;
  clearEnvCache();
}

async function postFeedback(
  body: unknown,
  opts: { headers?: Record<string, string>; bodyAsString?: string } = {},
): Promise<Response> {
  return app.request("/api/node/feedback", {
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

describe("POST /api/node/feedback - validation", () => {
  beforeEach(() => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
  });

  it("400: 빈 body", async () => {
    const res = await postFeedback({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("400: 잘못된 JSON", async () => {
    const res = await postFeedback(undefined, { bodyAsString: "{not json" });
    expect(res.status).toBe(400);
  });

  it("400: reason 화이트리스트 외", async () => {
    const res = await postFeedback({ ...validBody, reason: "bad-reason" });
    expect(res.status).toBe(400);
  });

  it("400: question 빈 문자열", async () => {
    const res = await postFeedback({ ...validBody, question: "" });
    expect(res.status).toBe(400);
  });

  it("400: question 4001자", async () => {
    const res = await postFeedback({
      ...validBody,
      question: "a".repeat(4001),
    });
    expect(res.status).toBe(400);
  });

  it("400: answer 8001자", async () => {
    const res = await postFeedback({
      ...validBody,
      answer: "a".repeat(8001),
    });
    expect(res.status).toBe(400);
  });

  it("400: messageId 누락", async () => {
    const { messageId: _omit, ...rest } = validBody;
    void _omit;
    const res = await postFeedback(rest);
    expect(res.status).toBe(400);
  });

  it("400: model 누락", async () => {
    const { model: _omit, ...rest } = validBody;
    void _omit;
    const res = await postFeedback(rest);
    expect(res.status).toBe(400);
  });

  it("400: retrievalChunkTitles 21개", async () => {
    const titles = Array.from({ length: 21 }, (_, i) => `t${i}`);
    const res = await postFeedback({
      ...validBody,
      retrievalChunkTitles: titles,
    });
    expect(res.status).toBe(400);
  });

  it("400: reasonDetail 501자", async () => {
    const res = await postFeedback({
      ...validBody,
      reasonDetail: "x".repeat(501),
    });
    expect(res.status).toBe(400);
  });

  it("정상: retrievalChunkTitles 누락 → default [] 적용 + 200", async () => {
    const { retrievalChunkTitles: _omit, ...rest } = validBody;
    void _omit;
    const res = await postFeedback(rest);
    expect(res.status).toBe(200);
  });

  it("정상: reasonDetail 누락 → 200", async () => {
    const { reasonDetail: _omit, ...rest } = validBody;
    void _omit;
    const res = await postFeedback(rest);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/node/feedback - mock 모드", () => {
  beforeEach(() => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
  });

  it("200: ok=true + notionPageId='mock-{messageId}'", async () => {
    const res = await postFeedback(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; notionPageId: string };
    expect(body.ok).toBe(true);
    expect(body.notionPageId).toBe(`mock-${validBody.messageId}`);
  });
});

describe("POST /api/node/feedback - real notion (msw)", () => {
  beforeEach(() => {
    setRealNotionEnv();
  });

  it("200: 정상 응답 → ok=true + notionPageId 반환", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ id: "page-feedback-1" }),
      ),
    );
    const res = await postFeedback(validBody);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; notionPageId: string };
    expect(body.ok).toBe(true);
    expect(body.notionPageId).toBe("page-feedback-1");
  });

  it("UA hash 가 Notion request body 에 포함", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );

    const res = await postFeedback(validBody, {
      headers: { "User-Agent": "Mozilla/5.0 (TestBrowser)" },
    });
    expect(res.status).toBe(200);
    expect(capturedBody).not.toBeNull();
    const props = (capturedBody! as {
      properties: Record<string, { rich_text: Array<{ text: { content: string } }> }>;
    }).properties;
    const uaHashChunks = props["UA hash"]!.rich_text;
    expect(uaHashChunks.length).toBeGreaterThan(0);
    const uaValue = uaHashChunks[0]!.text.content;
    expect(uaValue).toMatch(/^[0-9a-f]{8}$/);
    // 원본 user-agent 가 그대로 노출되면 안 된다.
    expect(uaValue).not.toContain("Mozilla");
  });

  it("503: NOTION_TOKEN 부재 (auth) → feedback_unavailable", async () => {
    delete process.env.NOTION_TOKEN;
    clearEnvCache();
    const res = await postFeedback(validBody);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("feedback_unavailable");
  });

  it("503: NOTION_FEEDBACK_DB_ID 부재 (auth) → feedback_unavailable", async () => {
    delete process.env.NOTION_FEEDBACK_DB_ID;
    clearEnvCache();
    const res = await postFeedback(validBody);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("feedback_unavailable");
  });

  it("422: schema mismatch (Notion 400) → feedback_invalid", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json(
          { object: "error", code: "validation_error", message: "Invalid property" },
          { status: 400 },
        ),
      ),
    );
    const res = await postFeedback(validBody);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("feedback_invalid");
  });

  it("503: Notion 401 → feedback_unavailable (auth)", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ object: "error", code: "unauthorized" }, { status: 401 }),
      ),
    );
    const res = await postFeedback(validBody);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("feedback_unavailable");
  });

  it("502 with retry: 첫 호출 500 → 재시도 200 → ok=true", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.notion.com/v1/pages", () => {
        calls++;
        if (calls === 1) return new HttpResponse("boom", { status: 500 });
        return HttpResponse.json({ id: "page-after-retry" });
      }),
    );
    const res = await postFeedback(validBody);
    expect(calls).toBe(2);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; notionPageId: string };
    expect(body.ok).toBe(true);
    expect(body.notionPageId).toBe("page-after-retry");
  }, 10_000);

  it("502: 첫 + 두 번째 모두 500 → feedback_failed (재시도 1회만)", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.notion.com/v1/pages", () => {
        calls++;
        return new HttpResponse("boom", { status: 500 });
      }),
    );
    const res = await postFeedback(validBody);
    expect(calls).toBe(2);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("feedback_failed");
  }, 10_000);

  it("response body 에 NOTION_TOKEN 누설 X (500 에러 시)", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        new HttpResponse("server error", { status: 500 }),
      ),
    );
    const res = await postFeedback(validBody);
    const text = await res.text();
    expect(text).not.toContain("secret_test_token");
    expect(text).not.toContain("Bearer");
  }, 10_000);

  it("response body 에 NOTION_TOKEN 누설 X (401 에러 시)", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ message: "unauthorized" }, { status: 401 }),
      ),
    );
    const res = await postFeedback(validBody);
    const text = await res.text();
    expect(text).not.toContain("secret_test_token");
    expect(text).not.toContain("Bearer");
  });

  it("auth 실패는 retry 하지 않음 (1회만 호출)", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.notion.com/v1/pages", () => {
        calls++;
        return HttpResponse.json({ message: "unauthorized" }, { status: 401 });
      }),
    );
    const res = await postFeedback(validBody);
    expect(calls).toBe(1);
    expect(res.status).toBe(503);
  });

  it("schema 실패는 retry 하지 않음 (1회만 호출)", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.notion.com/v1/pages", () => {
        calls++;
        return HttpResponse.json({ message: "bad" }, { status: 400 });
      }),
    );
    const res = await postFeedback(validBody);
    expect(calls).toBe(1);
    expect(res.status).toBe(422);
  });
});

describe("POST /api/node/feedback - HTTP method", () => {
  it("GET → 404/405", async () => {
    const res = await app.request("/api/node/feedback", { method: "GET" });
    expect([404, 405]).toContain(res.status);
  });
});
