import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/tests/msw/server";
import { clearEnvCache } from "@/lib/env";
import {
  appendFeedback,
  chunkRichText,
  hashUserAgent,
} from "@/services/notion-feedback";
import type { FeedbackInput } from "@/types/feedback";

const ENV_KEYS = ["NOTION_TOKEN", "NOTION_FEEDBACK_DB_ID", "MOCK_NOTION"] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  clearEnvCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  clearEnvCache();
  server.resetHandlers();
});

const baseInput: FeedbackInput = {
  messageId: "msg-1",
  question: "Module Federation 어떻게 적용했어요?",
  answer: "MFE 마이그레이션 TF에서 Vite 기반 Module Federation을 도입했습니다.",
  reason: "incomplete",
  reasonDetail: "더 자세히 알고 싶어요",
  model: "gpt-4o-mini",
  retrievalChunkTitles: [
    "Micro-Frontend Architecture 마이그레이션 TF",
    "Bidirectional Federation",
  ],
  uaHash: "abcd1234",
};

describe("chunkRichText", () => {
  it("빈 문자열 → 빈 array", () => {
    expect(chunkRichText("")).toEqual([]);
  });

  it("2000자 이하 → 단일 block", () => {
    const text = "a".repeat(2000);
    const out = chunkRichText(text);
    expect(out).toHaveLength(1);
    expect(out[0]!.text.content).toBe(text);
  });

  it("2001자 → 2 block 분할 (각 ≤ 2000)", () => {
    const text = "a".repeat(2001);
    const out = chunkRichText(text);
    expect(out).toHaveLength(2);
    expect(out[0]!.text.content.length).toBe(2000);
    expect(out[1]!.text.content.length).toBe(1);
  });

  it("4000자 → 정확히 2 block", () => {
    const text = "x".repeat(4000);
    const out = chunkRichText(text);
    expect(out).toHaveLength(2);
    expect(out[0]!.text.content.length).toBe(2000);
    expect(out[1]!.text.content.length).toBe(2000);
  });

  it("결합 시 원본 보존", () => {
    const text = "ㄱ".repeat(2500);
    const out = chunkRichText(text);
    expect(out.map((b) => b.text.content).join("")).toBe(text);
  });
});

describe("hashUserAgent", () => {
  it("8자 hex 반환", async () => {
    const h = await hashUserAgent("Mozilla/5.0 (X)");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("결정적 (같은 입력 → 같은 출력)", async () => {
    const a = await hashUserAgent("ua");
    const b = await hashUserAgent("ua");
    expect(a).toBe(b);
  });

  it("다른 입력 → 다른 출력", async () => {
    const a = await hashUserAgent("ua-A");
    const b = await hashUserAgent("ua-B");
    expect(a).not.toBe(b);
  });
});

describe("appendFeedback (MOCK_NOTION=1)", () => {
  beforeEach(() => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
  });

  it("ok=true + notionPageId='mock-{messageId}' 반환", async () => {
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.notionPageId).toBe(`mock-${baseInput.messageId}`);
    }
  });

  it("환경변수 부재여도 mock 모드면 ok=true", async () => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_FEEDBACK_DB_ID;
    clearEnvCache();
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(true);
  });
});

describe("appendFeedback (실제 호출, msw mock)", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret_test";
    process.env.NOTION_FEEDBACK_DB_ID = "db_id_test";
    clearEnvCache();
  });

  it("정상 응답 → ok=true + notionPageId 반환", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ id: "page-123" }),
      ),
    );

    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notionPageId).toBe("page-123");
  });

  it("정상 응답 시 properties 매핑이 NOTION_SCHEMA.md 와 일치", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "page-x" });
      }),
    );

    await appendFeedback(baseInput);
    expect(capturedBody).not.toBeNull();
    const body = capturedBody! as {
      parent: { database_id: string };
      properties: Record<string, unknown>;
    };
    expect(body.parent.database_id).toBe("db_id_test");
    expect(body.properties).toBeDefined();

    const props = body.properties as Record<string, { title?: unknown[]; rich_text?: unknown[]; select?: { name: string }; status?: { name: string } }>;
    // Title
    expect(Array.isArray(props.Title!.title)).toBe(true);
    // Question + Answer rich_text
    expect(Array.isArray(props.Question!.rich_text)).toBe(true);
    expect(Array.isArray(props.Answer!.rich_text)).toBe(true);
    // Reason: 한국어 라벨로 매핑 (incomplete → "관련 내용이 부족해요")
    expect(props.Reason!.select!.name).toBe("관련 내용이 부족해요");
    // ReasonDetail (no space, per NOTION_SCHEMA.md SSoT)
    expect(Array.isArray(props.ReasonDetail!.rich_text)).toBe(true);
    // Model
    expect(props.Model!.select!.name).toBe("gpt-4o-mini");
    // RetrievalChunks: " | "로 join
    const rcArr = props.RetrievalChunks!.rich_text as Array<{
      text: { content: string };
    }>;
    expect(rcArr[0]!.text.content).toContain(" | ");
    // Status
    expect(props.Status!.status!.name).toBe("새");
    // UA hash
    expect(Array.isArray(props["UA hash"]!.rich_text)).toBe(true);
  });

  it("reason 'inaccurate' → '정보가 정확하지 않아요'", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );
    await appendFeedback({ ...baseInput, reason: "inaccurate" });
    const props = (captured! as { properties: Record<string, { select: { name: string } }> })
      .properties;
    expect(props.Reason!.select.name).toBe("정보가 정확하지 않아요");
  });

  it("reason 'off-topic' → '내가 원한 답이 아니에요'", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );
    await appendFeedback({ ...baseInput, reason: "off-topic" });
    const props = (captured! as { properties: Record<string, { select: { name: string } }> })
      .properties;
    expect(props.Reason!.select.name).toBe("내가 원한 답이 아니에요");
  });

  it("reason 'other' → '기타'", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );
    await appendFeedback({ ...baseInput, reason: "other" });
    const props = (captured! as { properties: Record<string, { select: { name: string } }> })
      .properties;
    expect(props.Reason!.select.name).toBe("기타");
  });

  it("reasonDetail 부재 → 빈 rich_text", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );
    const { reasonDetail: _omit, ...rest } = baseInput;
    void _omit;
    await appendFeedback(rest);
    const props = (captured! as {
      properties: Record<string, { rich_text: unknown[] }>;
    }).properties;
    expect(props.ReasonDetail!.rich_text).toEqual([]);
  });

  it("긴 question (3000자) → multi-block rich_text", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );
    const long = "가".repeat(3000);
    await appendFeedback({ ...baseInput, question: long });
    const props = (captured! as {
      properties: Record<string, { rich_text: unknown[] }>;
    }).properties;
    expect(props.Question!.rich_text).toHaveLength(2);
  });

  it("Title 은 question 앞 100자 사용", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );
    const long = "ㅏ".repeat(150);
    await appendFeedback({ ...baseInput, question: long });
    const props = (captured! as {
      properties: Record<string, { title: Array<{ text: { content: string } }> }>;
    }).properties;
    expect(props.Title!.title[0]!.text.content.length).toBeLessThanOrEqual(100);
  });

  it("400 schema mismatch → reason='schema'", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json(
          { object: "error", code: "validation_error", message: "Invalid property" },
          { status: 400 },
        ),
      ),
    );
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("schema");
  });

  it("401 → reason='auth'", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ object: "error", code: "unauthorized" }, { status: 401 }),
      ),
    );
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("403 → reason='auth'", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ object: "error", code: "restricted_resource" }, { status: 403 }),
      ),
    );
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("500 → reason='unknown'", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        new HttpResponse("server error", { status: 500 }),
      ),
    );
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown");
  });

  it("429 1회 재시도 후 성공", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.notion.com/v1/pages", () => {
        calls++;
        if (calls === 1) return new HttpResponse("rate limited", { status: 429 });
        return HttpResponse.json({ id: "page-after-retry" });
      }),
    );
    const res = await appendFeedback(baseInput, { backoffMs: 0 });
    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notionPageId).toBe("page-after-retry");
  });

  it("429 2회 연속 → reason='unknown' (재시도 1회만)", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.notion.com/v1/pages", () => {
        calls++;
        return new HttpResponse("rate limited", { status: 429 });
      }),
    );
    const res = await appendFeedback(baseInput, { backoffMs: 0 });
    expect(calls).toBe(2);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown");
  });

  it("error message 에 NOTION_TOKEN 누설 X", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        new HttpResponse("server error", { status: 500 }),
      ),
    );
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).not.toContain("secret_test");
      expect(res.message).not.toContain("Bearer");
    }
  });
});

describe("appendFeedback 환경변수 부재", () => {
  it("NOTION_TOKEN 부재 → reason='auth'", async () => {
    process.env.NOTION_FEEDBACK_DB_ID = "db_id_test";
    delete process.env.NOTION_TOKEN;
    clearEnvCache();
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("NOTION_FEEDBACK_DB_ID 부재 → reason='auth'", async () => {
    process.env.NOTION_TOKEN = "secret_test";
    delete process.env.NOTION_FEEDBACK_DB_ID;
    clearEnvCache();
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("두 변수 모두 부재 → reason='auth'", async () => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_FEEDBACK_DB_ID;
    clearEnvCache();
    const res = await appendFeedback(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });
});
