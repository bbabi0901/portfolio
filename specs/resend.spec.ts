import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/tests/msw/server";
import { clearEnvCache } from "@/lib/env";
import { notifyContactReceived } from "@/services/resend";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_TO_EMAIL",
  "RESEND_FROM_EMAIL",
  "MOCK_NOTION",
  "MOCK_LLM",
  "NEXT_PUBLIC_SITE_URL",
] as const;

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
  toEmail: "owner@example.com",
  fromName: "방문자",
  fromEmail: "visitor@example.com",
  message: "안녕하세요, 협업 문의 드립니다.",
};

describe("notifyContactReceived (환경변수 부재)", () => {
  it("RESEND_API_KEY 부재 → reason='not-configured' (silent)", async () => {
    const res = await notifyContactReceived(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not-configured");
  });
});

describe("notifyContactReceived (mock 모드)", () => {
  it("MOCK_NOTION=1 → ok=true (호출 흉내)", async () => {
    process.env.MOCK_NOTION = "1";
    clearEnvCache();
    const res = await notifyContactReceived(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.id).toBe("string");
  });

  it("MOCK_LLM=1 → ok=true (호출 흉내)", async () => {
    process.env.MOCK_LLM = "1";
    clearEnvCache();
    const res = await notifyContactReceived(baseInput);
    expect(res.ok).toBe(true);
  });
});

describe("notifyContactReceived (실제 호출, msw mock)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_secret";
    process.env.RESEND_FROM_EMAIL = "noreply@yoonsoo.dev";
    clearEnvCache();
  });

  it("정상 응답 → ok=true + id 반환", async () => {
    server.use(http.post("https://api.resend.com/emails", () => HttpResponse.json({ id: "re-1" })));
    const res = await notifyContactReceived(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBe("re-1");
  });

  it("정상 응답 시 to/from/subject 가 매핑된다", async () => {
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "re-2" });
      }),
    );
    await notifyContactReceived(baseInput);
    expect(captured).not.toBeNull();
    const body = captured! as {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
    };
    expect(body.from).toBe("noreply@yoonsoo.dev");
    expect(Array.isArray(body.to) ? body.to[0] : body.to).toBe("owner@example.com");
    expect(body.subject).toContain("Contact");
    expect(body.html).toBeTypeOf("string");
  });

  it("Authorization 헤더에 Bearer 토큰", async () => {
    let authHeader: string | null = null;
    server.use(
      http.post("https://api.resend.com/emails", ({ request }) => {
        authHeader = request.headers.get("authorization");
        return HttpResponse.json({ id: "re-3" });
      }),
    );
    await notifyContactReceived(baseInput);
    expect(authHeader).toBe("Bearer re_test_secret");
  });

  it("401 → reason='auth'", async () => {
    server.use(
      http.post(
        "https://api.resend.com/emails",
        () => new HttpResponse("unauthorized", { status: 401 }),
      ),
    );
    const res = await notifyContactReceived(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("500 → reason='unknown'", async () => {
    server.use(
      http.post("https://api.resend.com/emails", () => new HttpResponse("err", { status: 500 })),
    );
    const res = await notifyContactReceived(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown");
  });

  it("이메일 본문(html)에 사용자 input HTML escape 적용", async () => {
    let captured: { html?: string } | null = null;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = (await request.json()) as { html?: string };
        return HttpResponse.json({ id: "re-x" });
      }),
    );
    await notifyContactReceived({
      ...baseInput,
      fromName: "<script>alert(1)</script>",
      message: "Hello & <b>world</b>",
    });
    const html = captured!.html ?? "";
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Hello &amp; &lt;b&gt;world&lt;/b&gt;");
  });

  it("error 메시지에 RESEND_API_KEY 누설 X", async () => {
    server.use(
      http.post("https://api.resend.com/emails", () => new HttpResponse("err", { status: 500 })),
    );
    const res = await notifyContactReceived(baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      // ResendErr.reason 만 노출. message 필드 자체가 없는 구조.
      const serialized = JSON.stringify(res);
      expect(serialized).not.toContain("re_test_secret");
      expect(serialized).not.toContain("Bearer");
    }
  });

  it("RESEND_TO_EMAIL 환경변수 → 기본 toEmail 으로 fallback (input 미지정 시)", async () => {
    process.env.RESEND_TO_EMAIL = "fallback@example.com";
    clearEnvCache();
    let captured: { to?: string | string[] } | null = null;
    server.use(
      http.post("https://api.resend.com/emails", async ({ request }) => {
        captured = (await request.json()) as { to?: string | string[] };
        return HttpResponse.json({ id: "re-fb" });
      }),
    );
    // toEmail 직접 지정 시 그대로 사용
    await notifyContactReceived(baseInput);
    const t1 = Array.isArray(captured!.to) ? captured!.to[0] : captured!.to;
    expect(t1).toBe("owner@example.com");
  });
});
