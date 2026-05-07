# Step 2: feedback-route

## 읽어야 할 파일

- `/CLAUDE.md` — `/api/feedback` 은 Node runtime, NOTION_TOKEN 클라이언트 노출 금지.
- `/docs/ARCHITECTURE.md` — 데이터 흐름 (button → /api/feedback → Notion).
- `/docs/AI_CONTRACT.md` — Feedback flow: 5단계 (👎 클릭 → reason → submit → /api/node/feedback → 토스트 → 노션 row).
- `/spec.json` — `features[]` FEAT-004 (Feedback), `errorPolicies[]` ERR-09.
- `/services/notion-feedback.ts` — 이전 step 0.
- `/types/feedback.ts` — 이전 step 0.
- `/app/api/node/[[...route]]/route.ts` — 이전 task `0-scaffold`. `/api/node/feedback` placeholder 501 존재.

## 작업

`/api/node/feedback` POST 라우트 구현. zod 검증 + Notion call + retry 1회 + ERR-09 fallback. TDD.

### TDD 순서

1. `specs/feedback-route.spec.ts` 작성 (실패).
2. `app/api/node/[[...route]]/route.ts` 의 placeholder 교체 (통과).

### 시그니처

```ts
// app/api/node/[[...route]]/route.ts (Node runtime, 기존 Hono app 의 /feedback 만 교체)
import { z } from "zod";
import { appendFeedback, hashUserAgent } from "@/services/notion-feedback";

const FeedbackBodySchema = z.object({
  messageId: z.string().min(1).max(100),
  question: z.string().min(1).max(4000),
  answer: z.string().min(1).max(8000),
  reason: z.enum(["inaccurate", "off-topic", "incomplete", "other"]),
  reasonDetail: z.string().max(500).optional(),
  model: z.string().min(1).max(50),
  retrievalChunkTitles: z.array(z.string().max(200)).max(20).default([]),
});

app.post("/feedback", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = FeedbackBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
  }

  const ua = c.req.header("user-agent") ?? "";
  const uaHash = await hashUserAgent(ua);

  // 1차 시도
  let res = await appendFeedback({ ...parsed.data, uaHash });

  // ERR-09 retry: schema/auth 외 일시 오류만. 1회만.
  if (!res.ok && res.reason === "unknown") {
    await new Promise((r) => setTimeout(r, 1000));
    res = await appendFeedback({ ...parsed.data, uaHash });
  }

  if (res.ok) {
    return c.json({ ok: true, notionPageId: res.notionPageId }, 200);
  }

  // 매핑
  switch (res.reason) {
    case "auth":     return c.json({ error: "feedback_unavailable" }, 503);
    case "schema":   return c.json({ error: "feedback_invalid" }, 422);
    default:         return c.json({ error: "feedback_failed" }, 502);
  }
});
```

### Specs (TDD red)

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { server } from "@/tests/msw/server";
import { http, HttpResponse } from "msw";

// app 인스턴스 import
import { default as nodeApp } from "@/app/api/node/[[...route]]/route";
// 또는 별도 export. Hono app.request("/api/node/feedback", { method: "POST", body, headers }).

describe("/api/node/feedback", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret";
    process.env.NOTION_FEEDBACK_DB_ID = "db";
  });
  afterEach(() => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_FEEDBACK_DB_ID;
  });

  it("400: 빈 body", async () => { /* … */ });
  it("400: reason 화이트리스트 외", async () => { /* … */ });
  it("400: question 4001자", async () => { /* … */ });
  it("400: retrievalChunkTitles 21개", async () => { /* … */ });

  it("정상: ok=true + notionPageId 반환", async () => {
    server.use(http.post("https://api.notion.com/v1/pages",
      () => HttpResponse.json({ id: "page-feedback-1" })));
    /* … */
  });

  it("503: NOTION_TOKEN 부재 (auth)", async () => { /* … */ });
  it("422: schema mismatch (Notion 400)", async () => {
    server.use(http.post("https://api.notion.com/v1/pages",
      () => HttpResponse.json({ message: "bad" }, { status: 400 })));
    /* … */
  });

  it("502 with retry: 첫 호출 500 → 재시도 200 → ok=true", async () => {
    let calls = 0;
    server.use(http.post("https://api.notion.com/v1/pages", () => {
      calls++;
      if (calls === 1) return HttpResponse.json({}, { status: 500 });
      return HttpResponse.json({ id: "page-feedback-2" });
    }));
    /* … */
  });

  it("502 with retry: 첫 + 두 번째 모두 500 → 502", async () => { /* … */ });

  it("UA hash 가 Notion request body 에 포함", async () => {
    let captured: any;
    server.use(http.post("https://api.notion.com/v1/pages", async (info) => {
      captured = await info.request.json();
      return HttpResponse.json({ id: "p" });
    }));
    /* fetch 후 captured.properties["UA hash"] 검증. */
  });
});
```

### 핵심 규칙 (위반 금지)

- **Node runtime 라우트만 수정.** Edge `/api/chat` 건드리지 마라.
- **NOTION_TOKEN 응답에 누설 금지.**
- **retry 는 unknown 한정 + 1회만.** auth/schema 는 즉시 실패 응답.
- **rate limit hook 추가 금지** (이 step). 후속 task `6-guards-seo`.
- **사용자 정확 user-agent 저장 금지.** uaHash 만.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/feedback-route.spec.ts
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

수동:
```bash
npm run dev &
sleep 5
# MOCK_NOTION=1 시 mock 응답
curl -sS -X POST http://localhost:3000/api/node/feedback \
  -H "Content-Type: application/json" \
  -d '{"messageId":"m1","question":"Q","answer":"A","reason":"inaccurate","model":"gpt-4o-mini","retrievalChunkTitles":[]}'
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `app/api/node/[[...route]]/route.ts` 의 `/feedback` placeholder 가 실제 구현으로 교체.
   - 모든 spec 통과.
   - retry 시퀀스 정확 (msw call counter).
   - UA hash 가 body 에 포함.
3. `phases/5-feedback-contact-api/index.json` step 2 갱신.

## 금지사항

- **`/feedback` 외 다른 라우트 변경 금지.**
- **Edge runtime 으로 옮기기 금지.** 이유: notion sdk Node 의존.
- **GitHub Issue / Slack fallback 추가 금지** (이 step). 향후 옵션. ERR-09 의 mailto fallback 도 chat backend 의 chat 응답이지 feedback 는 silent 502.
- **`onError` 의 stack trace 응답 노출 금지.**
- **client UI 변경 금지.** 후속 step 4.
