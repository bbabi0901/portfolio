# Step 0: notion-feedback-service

## 읽어야 할 파일

- `/CLAUDE.md` — Notion API 호출은 `/api/node/*` 만, NOTION_TOKEN 클라이언트 노출 금지.
- `/docs/NOTION_SCHEMA.md` — **"Q&A 피드백" DB schema** (Title, Question, Answer, Reason, Reason Detail, Model, RetrievalChunks, Status, Created, UA hash).
- `/docs/ADR.md` — ADR-013 피드백 저장소 = 노션, ADR-014 Edge/Node split.
- `/docs/AI_CONTRACT.md` — feedback flow.
- `/spec.json` — `features[]` 의 FEAT-004 (Feedback 👍/👎), `rateLimits.feedbackPerMinute`.
- `/services/notion.ts` — 이전 task `1-content-pipeline` 의 노션 page/DB fetch wrapper. 여기서는 **write** API (pages.create) 신규 추가.
- `/lib/env.ts` — `getServerEnv()` 로 NOTION_TOKEN, NOTION_FEEDBACK_DB_ID 접근.

## 작업

`services/notion-feedback.ts` — Q&A 피드백 DB 에 row 추가하는 server-only 함수. TDD.

### TDD 순서

1. `specs/notion-feedback-service.spec.ts` 작성 (실패).
2. `services/notion-feedback.ts` 구현 (통과).

### 시그니처

```ts
// types/feedback.ts
export type FeedbackReason = "inaccurate" | "off-topic" | "incomplete" | "other";
export type FeedbackKind = "up" | "down";

export interface FeedbackInput {
  messageId: string;            // 클라이언트 제공 — 추후 노션 row dedup 용 (옵션)
  question: string;             // 사용자 질문 원문 (full)
  answer: string;               // 어시스턴트 응답 원문 (full)
  reason: FeedbackReason;
  reasonDetail?: string;        // reason="other" 일 때
  model: string;                // "gpt-4o-mini" 등
  retrievalChunkTitles: string[];   // 검색된 chunk 의 sourceTitle 목록
  uaHash: string;               // user-agent sha256 앞 8자 (Edge 라우트에서 계산 후 전달)
}

export interface FeedbackResult {
  ok: true;  notionPageId: string;
}
export interface FeedbackError {
  ok: false; reason: "auth" | "schema" | "unknown"; message: string;
}
```

```ts
// services/notion-feedback.ts
import { Client } from "@notionhq/client";
import { getServerEnv } from "@/lib/env";
import type { FeedbackInput, FeedbackResult, FeedbackError } from "@/types/feedback";

/**
 * Q&A 피드백 DB 에 row 추가.
 *
 * MOCK_NOTION=1: 호출 흉내만 내고 ok=true + notionPageId="mock-{messageId}" 반환 (테스트/dev).
 *
 * 실제 호출:
 *  - notion.pages.create({ parent: { database_id: NOTION_FEEDBACK_DB_ID }, properties: {...} })
 *  - 환경변수 NOTION_TOKEN, NOTION_FEEDBACK_DB_ID 둘 중 하나 부재 → ok=false reason="auth".
 *  - schema mismatch (HTTPResponseError 400) → reason="schema".
 *  - 기타 → reason="unknown".
 *
 * Notion property mapping (NOTION_SCHEMA.md):
 *  - Title (title): question.slice(0, 100)
 *  - Question (rich_text): question (full)
 *  - Answer (rich_text): answer (full)
 *  - Reason (select): reason (4 values)
 *  - Reason Detail (rich_text): reasonDetail ?? ""
 *  - Model (select): model
 *  - RetrievalChunks (rich_text): retrievalChunkTitles.join(" | ")
 *  - Status (status): "새"
 *  - UA hash (rich_text): uaHash
 *  - Created: created_time, 자동 생성 (touch X)
 *
 * Notion 의 rich_text 는 단일 text block 당 2000자 제한. question/answer 가 길면 multi-block 분할.
 */
export async function appendFeedback(input: FeedbackInput): Promise<FeedbackResult | FeedbackError>;

/** 헬퍼: rich_text array (2000자 split) 생성. */
export function chunkRichText(text: string): Array<{ text: { content: string } }>;

/** 헬퍼: User-Agent → SHA256(앞 8자). Edge runtime 의 chat 라우트는 이 함수 사용 X (Edge crypto.subtle 사용). 이 step 은 Node. */
export async function hashUserAgent(ua: string): Promise<string>;
```

### Specs (TDD red)

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { server } from "@/tests/msw/server";
import { http, HttpResponse } from "msw";
import { appendFeedback, chunkRichText } from "@/services/notion-feedback";

describe("chunkRichText", () => {
  it("2000자 이하 → 단일 block", () => { /* … */ });
  it("2001자 → 2 block 분할", () => { /* … */ });
  it("빈 문자열 → 빈 array", () => { /* … */ });
});

describe("appendFeedback (MOCK_NOTION=1)", () => {
  beforeEach(() => { process.env.MOCK_NOTION = "1"; });
  afterEach(() => { delete process.env.MOCK_NOTION; });

  it("ok=true + notionPageId 반환", async () => { /* … */ });
});

describe("appendFeedback (실제 호출, msw mock)", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret_test";
    process.env.NOTION_FEEDBACK_DB_ID = "db_id_test";
  });
  afterEach(() => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_FEEDBACK_DB_ID;
  });

  it("정상 응답 → ok=true", async () => {
    server.use(http.post("https://api.notion.com/v1/pages",
      () => HttpResponse.json({ id: "page-123" })));
    /* … */
  });

  it("400 schema mismatch → reason='schema'", async () => { /* … */ });
  it("401 → reason='auth'", async () => { /* … */ });
  it("500 → reason='unknown'", async () => { /* … */ });
});

describe("appendFeedback 환경변수 부재", () => {
  it("NOTION_TOKEN 부재 → reason='auth'", async () => { /* … */ });
  it("NOTION_FEEDBACK_DB_ID 부재 → reason='auth'", async () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **Node runtime 전용.** `@notionhq/client` 는 Edge 미호환. 이 step 의 모든 코드는 Node-only.
- **NOTION_TOKEN 을 응답/로그에 절대 포함 금지.** 마스킹: `console.error` 시 token 부분 ***.
- **PII 최소화.** 사용자가 보낸 question/answer 외 IP, 정확 user-agent 저장 금지. uaHash 만.
- **Notion API rate limit 대응**: 429 → 1회 retry (지수 백오프 1초). 그 외 reason="unknown".
- **MOCK_NOTION=1 분기는 production 빌드에서도 그대로 포함.** 이유: dev/CI 양쪽 동작.
- **rich_text 2000자 cap 강제.** 그렇지 않으면 Notion API 가 400 반환.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/notion-feedback-service.spec.ts
npx tsc --noEmit
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `services/notion-feedback.ts`, `types/feedback.ts`, spec 파일 존재.
   - 모든 spec 통과.
   - `grep -nE "process\\.env\\.NOTION_TOKEN" services/notion-feedback.ts` → 0건 (getServerEnv 만 사용).
   - 응답 결과에 token 누설 없음 (error message 직접 검사).
3. `phases/5-feedback-contact-api/index.json` step 0 갱신.

## 금지사항

- **`/api/node/feedback` 라우트 추가 금지** (이 step). 이유: 후속 step 2.
- **Edge runtime import 금지.** 이 모듈은 Node only.
- **Notion DB 의 schema 변경 금지** (이 step). 이유: NOTION_SCHEMA.md 가 SSoT, 변경 시 별도 task.
- **PII 정밀화 금지** (실제 IP 로깅 등). 이유: 프라이버시.
- **재시도 무한 loop 금지** (지수 백오프 cap).
- **rate limit 구현 금지** (이 step). 이유: rate limit 은 후속 task `6-guards-seo`.
