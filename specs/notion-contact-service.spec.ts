import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/tests/msw/server";
import { clearEnvCache } from "@/lib/env";
import { appendContact } from "@/services/notion-contact";

const ENV_KEYS = ["NOTION_TOKEN", "NOTION_CONTACT_DB_ID", "MOCK_NOTION"] as const;
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

const baseInput = {
  name: "김윤수",
  email: "user@example.com",
  message: "안녕하세요. 협업 관련 문의 드립니다.",
  uaHash: "abcd1234",
};

describe("appendContact (MOCK_NOTION=1)", () => {
  beforeEach(() => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
  });

  it("ok=true + notionPageId='mock-contact-{uaHash}' 반환", async () => {
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.notionPageId).toBe(`mock-contact-${baseInput.uaHash}`);
    }
  });

  it("환경변수 부재여도 mock 모드면 ok=true", async () => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_CONTACT_DB_ID;
    clearEnvCache();
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(true);
  });
});

describe("appendContact 환경변수 부재", () => {
  it("NOTION_TOKEN 부재 → reason='not-configured'", async () => {
    process.env.NOTION_CONTACT_DB_ID = "db_id_test";
    delete process.env.NOTION_TOKEN;
    clearEnvCache();
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not-configured");
  });

  it("NOTION_CONTACT_DB_ID 부재 → reason='not-configured' (ERR-27)", async () => {
    process.env.NOTION_TOKEN = "secret_test";
    delete process.env.NOTION_CONTACT_DB_ID;
    clearEnvCache();
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not-configured");
  });
});

describe("appendContact (실제 호출, msw mock)", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret_test";
    process.env.NOTION_CONTACT_DB_ID = "db_id_test";
    clearEnvCache();
  });

  it("정상 응답 → ok=true + notionPageId 반환", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () => HttpResponse.json({ id: "ctc-1" })),
    );

    const res = await appendContact(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.notionPageId).toBe("ctc-1");
  });

  it("정상 응답 시 properties 매핑이 NOTION_SCHEMA.md 와 일치", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "ctc-2" });
      }),
    );

    await appendContact(baseInput);
    expect(capturedBody).not.toBeNull();
    const body = capturedBody! as {
      parent: { database_id: string };
      properties: Record<string, unknown>;
    };
    expect(body.parent.database_id).toBe("db_id_test");

    const props = body.properties as Record<
      string,
      {
        title?: Array<{ text: { content: string } }>;
        rich_text?: Array<{ text: { content: string } }>;
        email?: string;
        status?: { name: string };
      }
    >;

    // Title (사용자 name)
    expect(Array.isArray(props.Title!.title)).toBe(true);
    expect(props.Title!.title![0]!.text.content).toBe("김윤수");
    // Email
    expect(props.Email!.email).toBe("user@example.com");
    // Message rich_text
    expect(Array.isArray(props.Message!.rich_text)).toBe(true);
    expect(props.Message!.rich_text![0]!.text.content).toBe("안녕하세요. 협업 관련 문의 드립니다.");
    // UA hash
    expect(Array.isArray(props["UA hash"]!.rich_text)).toBe(true);
    expect(props["UA hash"]!.rich_text![0]!.text.content).toBe("abcd1234");
    // Status
    expect(props.Status!.status!.name).toBe("새");
  });

  it("Title 은 name 앞 60자 사용", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "p" });
      }),
    );
    const longName = "ㅏ".repeat(80);
    await appendContact({ ...baseInput, name: longName });
    const props = (
      captured! as {
        properties: Record<string, { title: Array<{ text: { content: string } }> }>;
      }
    ).properties;
    expect(props.Title!.title[0]!.text.content.length).toBeLessThanOrEqual(60);
  });

  it("긴 message (3000자) → chunkRichText 분할 적용 (2 block)", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.notion.com/v1/pages", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "ctc-2" });
      }),
    );
    await appendContact({
      ...baseInput,
      message: "x".repeat(3000),
    });
    const props = (
      captured! as {
        properties: Record<string, { rich_text: unknown[] }>;
      }
    ).properties;
    expect(props.Message!.rich_text).toHaveLength(2);
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
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("schema");
  });

  it("401 → reason='auth'", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ object: "error", code: "unauthorized" }, { status: 401 }),
      ),
    );
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("403 → reason='auth'", async () => {
    server.use(
      http.post("https://api.notion.com/v1/pages", () =>
        HttpResponse.json({ object: "error", code: "restricted_resource" }, { status: 403 }),
      ),
    );
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("500 → reason='unknown'", async () => {
    server.use(
      http.post(
        "https://api.notion.com/v1/pages",
        () => new HttpResponse("server error", { status: 500 }),
      ),
    );
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown");
  });

  it("error message 에 NOTION_TOKEN 누설 X", async () => {
    server.use(
      http.post(
        "https://api.notion.com/v1/pages",
        () => new HttpResponse("server error", { status: 500 }),
      ),
    );
    const res = await appendContact(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).not.toContain("secret_test");
      expect(res.message).not.toContain("Bearer");
    }
  });
});
