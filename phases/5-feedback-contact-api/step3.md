# Step 3: contact-route

## 읽어야 할 파일

- `/CLAUDE.md` — `/api/contact` 은 Node runtime.
- `/docs/AI_CONTRACT.md` — 인젝션 방어 (메시지 자체는 검증, mailto 는 client 책임).
- `/spec.json` — `features[]` FEAT-026, FEAT-027 (봇 보호), `errorPolicies[]` ERR-21 (Notion → Resend → mailto fallback chain), ERR-22 (4xx 검증), ERR-23 (429), ERR-26 (Resend silent), ERR-27 (DB ID 미설정).
- `/services/notion-contact.ts`, `/services/resend.ts` — 이전 step 1.
- `/lib/contact-schema.ts` — 이전 task `4-pages-side-menu`.
- `/services/notion-feedback.ts` — hashUserAgent helper.
- `/app/api/node/[[...route]]/route.ts` — 이전 step 2.

## 작업

`/api/node/contact` POST 라우트. zod 검증 + honeypot 차단 + 1.5초 임계 (옵션) + Notion → Resend → mailto fallback chain. TDD.

### TDD 순서

1. `specs/contact-route.spec.ts` 작성 (실패).
2. `app/api/node/[[...route]]/route.ts` 의 `/contact` placeholder 교체 (통과).

### 시그니처

```ts
import { ContactSchema } from "@/lib/contact-schema";
import { appendContact } from "@/services/notion-contact";
import { notifyContactReceived } from "@/services/resend";
import { hashUserAgent } from "@/services/notion-feedback";
import { getServerEnv } from "@/lib/env";

const ContactBodySchema = ContactSchema.extend({
  /** UI 가 client 측에서 측정한 form-mount→submit elapsed ms. 1500 미만 → bot 의심. 위조 가능하므로 보조 신호. */
  elapsedMs: z.number().int().nonnegative().optional(),
});

app.post("/contact", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = ContactBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", issues: parsed.error.issues }, 422);
  }
  const data = parsed.data;

  // 봇 1차: honeypot
  if (data.website && data.website.length > 0) {
    return c.json({ ok: true, _silent: true }, 200);    // 봇에게 200 반환 (학습 방지)
  }

  // 봇 2차: elapsedMs < 1500 → 거부 (선택 — 보조 신호)
  if (typeof data.elapsedMs === "number" && data.elapsedMs < 1500) {
    return c.json({ error: "too_fast" }, 422);
  }

  const ua = c.req.header("user-agent") ?? "";
  const uaHash = await hashUserAgent(ua);

  // 1차: Notion 저장 (1회 retry on unknown)
  let notionRes = await appendContact({ name: data.name, email: data.email, message: data.message, uaHash });
  if (!notionRes.ok && notionRes.reason === "unknown") {
    await new Promise((r) => setTimeout(r, 1000));
    notionRes = await appendContact({ name: data.name, email: data.email, message: data.message, uaHash });
  }

  // ERR-27: NOTION_CONTACT_DB_ID 미설정 → 503
  if (!notionRes.ok && notionRes.reason === "not-configured") {
    return c.json({ error: "contact_not_configured", mailto: "mailto:bbabi0901@gmail.com" }, 503);
  }

  // ERR-21 fallback chain: Notion 실패 (auth/schema/unknown) → Resend 시도 → 그것도 실패면 mailto 반환.
  if (!notionRes.ok) {
    const resendEnv = getServerEnv();
    if (resendEnv.RESEND_API_KEY) {
      const resendRes = await notifyContactReceived({
        toEmail: process.env.RESEND_TO_EMAIL ?? "bbabi0901@gmail.com",
        fromName: data.name,
        fromEmail: data.email,
        message: data.message,
      });
      if (resendRes.ok) {
        return c.json({ ok: true, channel: "resend" }, 200);
      }
    }
    // mailto fallback 메타데이터 응답 (UI 가 "직접 메일 주세요" 링크 표시).
    return c.json({ error: "contact_failed", mailto: "mailto:bbabi0901@gmail.com" }, 502);
  }

  // Notion 성공 + Resend 알림 (silent)
  if (getServerEnv().RESEND_API_KEY) {
    notifyContactReceived({
      toEmail: process.env.RESEND_TO_EMAIL ?? "bbabi0901@gmail.com",
      fromName: data.name, fromEmail: data.email, message: data.message,
    }).catch(() => {});  // ERR-26 silent
  }

  return c.json({ ok: true, channel: "notion", notionPageId: notionRes.notionPageId }, 200);
});
```

### Specs (TDD red)

```ts
describe("/api/node/contact", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret";
    process.env.NOTION_CONTACT_DB_ID = "ctc-db";
    delete process.env.RESEND_API_KEY;
  });
  afterEach(() => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_CONTACT_DB_ID;
    delete process.env.RESEND_API_KEY;
  });

  it("422: 이메일 형식 위반", async () => { /* … */ });
  it("422: 메시지 9자", async () => { /* … */ });
  it("422: name 41자", async () => { /* … */ });

  it("honeypot 채워짐 → 200 silent (Notion 저장 안 됨)", async () => {
    let notionCalled = false;
    server.use(http.post("https://api.notion.com/v1/pages", () => {
      notionCalled = true;
      return HttpResponse.json({ id: "x" });
    }));
    /* … */
    expect(notionCalled).toBe(false);
  });

  it("422: elapsedMs < 1500 → too_fast", async () => { /* … */ });

  it("정상: Notion 저장 → 200 + channel='notion'", async () => {
    server.use(http.post("https://api.notion.com/v1/pages",
      () => HttpResponse.json({ id: "ctc-1" })));
    /* … */
  });

  it("503: NOTION_CONTACT_DB_ID 부재 + mailto 응답", async () => { /* … */ });

  it("ERR-21 fallback: Notion auth 실패 + Resend 미설정 → 502 + mailto", async () => {
    delete process.env.NOTION_TOKEN;
    /* … */
  });

  it("ERR-21 fallback: Notion 500 + Resend 200 → 200 channel='resend'", async () => {
    process.env.RESEND_API_KEY = "re-key";
    server.use(
      http.post("https://api.notion.com/v1/pages",
        () => HttpResponse.json({}, { status: 500 })),
      http.post("https://api.resend.com/emails",
        () => HttpResponse.json({ id: "re-1" })),
    );
    /* … */
  });

  it("ERR-21 fallback: Notion + Resend 모두 실패 → 502 + mailto", async () => { /* … */ });

  it("Notion 정상 + Resend 미설정 → 200 + channel='notion' (Resend 호출 X)", async () => { /* … */ });

  it("Notion 정상 + Resend 설정 + Resend 실패 → 200 channel='notion' (silent)", async () => {
    process.env.RESEND_API_KEY = "re-key";
    server.use(
      http.post("https://api.notion.com/v1/pages",
        () => HttpResponse.json({ id: "ok" })),
      http.post("https://api.resend.com/emails",
        () => HttpResponse.json({}, { status: 500 })),
    );
    /* 응답은 200 channel='notion'. Resend 실패 무시 (ERR-26). */
  });

  it("UA hash 가 Notion request body 에 포함", async () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **honeypot 채워짐 → 200 silent.** 이유: 봇 학습 방지. 실제 저장 X.
- **elapsedMs 는 보조 신호.** 클라이언트가 위조 가능하니 단독으로 신뢰 X. 단, 1500 미만은 거의 봇이라 차단.
- **ERR-21 fallback chain 순서 강제**: Notion → Resend (있으면) → mailto.
- **mailto 응답에는 절대 사용자 입력값 echo back 하지 마라.** 이유: open redirect / phishing surface. 단순 `mailto:bbabi0901@gmail.com` 만.
- **응답에 NOTION_TOKEN, RESEND_API_KEY 절대 노출 금지.**
- **Resend 알림은 fire-and-forget**. 응답 chain 의 latency 에 영향 X (Notion 성공 시 await 안 함).
- **Node runtime only.**

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/contact-route.spec.ts
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

수동:
```bash
npm run dev &
sleep 5
curl -sS -X POST http://localhost:3000/api/node/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"홍길동","email":"hong@example.com","message":"안녕하세요 — 테스트 메시지입니다.","website":"","elapsedMs":3000}'
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `/contact` placeholder 교체.
   - 모든 spec 통과 — 특히 fallback chain 3 케이스.
   - honeypot 정상 동작.
   - mailto 응답 단일 상수.
3. `phases/5-feedback-contact-api/index.json` step 3 갱신.

## 금지사항

- **`/contact` 외 다른 라우트 수정 금지.**
- **honeypot 채워짐 시 422 또는 4xx 응답 금지.** 200 silent 만.
- **Edge runtime 변환 금지.**
- **Notion + Resend 둘 다 호출 후 latency-aware 분기 금지.** 단순 cascade chain.
- **사용자 입력을 mailto URL 의 query 로 prefill 금지** (?subject=…&body=…). 이유: open redirect / phishing.
- **rate limit 구현 금지** (후속 task).
- **UI 컴포넌트 변경 금지.** 후속 step 4.
