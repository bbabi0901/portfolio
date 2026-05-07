# Step 1: notion-contact-service

## 읽어야 할 파일

- `/CLAUDE.md` — Node runtime, NOTION_TOKEN/RESEND_API_KEY 환경변수.
- `/docs/NOTION_SCHEMA.md` — **"Contact" DB schema** (Title=name, Email, Message, Created, UA hash, Status).
- `/docs/ADR.md` — ADR-013 (피드백 = Notion), ADR-014.
- `/spec.json` — `features[]` 의 FEAT-026 (Contact 페이지/폼), `errorPolicies[]` ERR-21 (Contact Notion 실패 → Resend → mailto fallback chain), ERR-26 (Resend 실패 silent), ERR-27 (DB ID 미설정 → 503).
- `/lib/env.ts` — 환경변수.
- `/services/notion-feedback.ts` — 이전 step. chunkRichText, hashUserAgent helper 재사용.
- `/lib/contact-schema.ts` — 이전 task `4-pages-side-menu` 의 ContactSchema (zod).

## 작업

`services/notion-contact.ts` (Contact DB write) + `services/resend.ts` (이메일 알림 fallback). TDD.

### TDD 순서

1. `specs/notion-contact-service.spec.ts` + `specs/resend.spec.ts` 작성 (실패).
2. 구현 (통과).

### 시그니처

```ts
// services/notion-contact.ts
import type { ContactInput } from "@/lib/contact-schema";

export interface ContactSavedResult {
  ok: true;  notionPageId: string;
}
export interface ContactErrorResult {
  ok: false; reason: "auth" | "schema" | "unknown" | "not-configured"; message: string;
}

export async function appendContact(
  input: Pick<ContactInput, "name" | "email" | "message"> & { uaHash: string }
): Promise<ContactSavedResult | ContactErrorResult>;
```

#### Notion property mapping (NOTION_SCHEMA.md)

- Title (title): `name.slice(0, 60)`
- Email (email): `email`
- Message (rich_text): chunkRichText(message)  // 2000자 split
- UA hash (rich_text): uaHash
- Status (status): "새"
- Created: 자동.

#### 환경변수

- `NOTION_TOKEN` 부재 → reason="auth".
- `NOTION_CONTACT_DB_ID` 부재 → reason="not-configured" (ERR-27 매핑).
- 둘 다 있으면 정상 호출.
- `MOCK_NOTION=1` → ok=true + notionPageId="mock-contact-{hash}" 반환.

```ts
// services/resend.ts
export interface ResendNotificationInput {
  toEmail: string;          // 사용자 본인 (이메일 알림 받을 곳, RESEND_TO_EMAIL)
  fromName: string;         // 사용자가 입력한 name
  fromEmail: string;        // 사용자가 입력한 email
  message: string;          // 사용자 입력 message
}

export interface ResendOk { ok: true; id: string }
export interface ResendErr { ok: false; reason: "not-configured" | "auth" | "unknown" }

/**
 * Resend 로 이메일 알림 발송. RESEND_API_KEY 미설정 시 silent ("not-configured" 반환).
 *
 * MOCK_LLM 또는 MOCK_NOTION=1 시: 호출 흉내 + ok=true 반환 (테스트).
 *
 * 실패 시 (auth, network, 5xx) "unknown" 반환. 호출측은 silent (ERR-26).
 */
export async function notifyContactReceived(input: ResendNotificationInput): Promise<ResendOk | ResendErr>;
```

- Resend SDK (`resend` npm) 추가 필요 시 `npm install resend`. 없으면 fetch 로 직접 호출 (`POST https://api.resend.com/emails` + `Authorization: Bearer {RESEND_API_KEY}`).
- 권장: SDK 미사용, fetch 직접. 의존성 최소.

### Specs (TDD red)

```ts
// specs/notion-contact-service.spec.ts
describe("appendContact", () => {
  it("MOCK_NOTION=1 → ok=true + notionPageId='mock-contact-...'", async () => { /* … */ });

  it("NOTION_TOKEN 부재 → reason='auth'", async () => { /* … */ });
  it("NOTION_CONTACT_DB_ID 부재 → reason='not-configured'", async () => { /* … */ });

  it("정상 호출 → ok=true (msw mock)", async () => {
    server.use(http.post("https://api.notion.com/v1/pages",
      () => HttpResponse.json({ id: "ctc-1" })));
    /* … */
  });

  it("400 schema → reason='schema'", async () => { /* … */ });
  it("500 → reason='unknown'", async () => { /* … */ });

  it("긴 message (3000자) → chunkRichText 분할 적용", async () => {
    const calls: any[] = [];
    server.use(http.post("https://api.notion.com/v1/pages", async (info) => {
      calls.push(await info.request.json());
      return HttpResponse.json({ id: "ctc-2" });
    }));
    await appendContact({ name: "A", email: "a@b.com", message: "x".repeat(3000), uaHash: "abc" });
    /* expect: properties.Message.rich_text 가 2 block. */
  });
});
```

```ts
// specs/resend.spec.ts
describe("notifyContactReceived", () => {
  it("RESEND_API_KEY 부재 → reason='not-configured'", async () => { /* … */ });

  it("MOCK_NOTION=1 → ok=true (호출 흉내)", async () => { /* … */ });

  it("정상 호출 → ok=true + id 반환 (msw mock)", async () => {
    server.use(http.post("https://api.resend.com/emails",
      () => HttpResponse.json({ id: "re-1" })));
    /* … */
  });

  it("401 → reason='auth'", async () => { /* … */ });
  it("500 → reason='unknown'", async () => { /* … */ });

  it("이메일 본문에 사용자 input 포함 (HTML escape 적용)", async () => {
    /* "<script>alert(1)</script>" 입력 → 이메일 body 에 &lt;script&gt; 형태. */
  });
});
```

### 핵심 규칙 (위반 금지)

- **HTML escape 필수** (Resend 메일 body). 사용자 입력 그대로 HTML 본문 삽입 시 XSS (이메일 client 의 lax HTML 렌더링).
- **이메일 발송 실패 시 silent (ERR-26).** 호출측에 throw 하지 마라. ResendErr 반환.
- **NOTION_TOKEN, RESEND_API_KEY 절대 응답/로그에 노출 금지.**
- **Resend 의 from address 는 verified domain 만**. RESEND_FROM_EMAIL 환경변수 (없으면 기본 `noreply@<NEXT_PUBLIC_SITE_URL host>`). 이 step 에서 verified domain 검증 X (런타임 fail 시 "unknown").
- **Node runtime only.**

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/notion-contact-service.spec.ts specs/resend.spec.ts
npx tsc --noEmit
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `services/notion-contact.ts`, `services/resend.ts`, spec 파일 존재.
   - 모든 spec 통과.
   - HTML escape 테스트 통과.
   - `grep -nE "process\\.env\\.(NOTION|RESEND)" services/` → getServerEnv 외 직접 접근 0.
3. `phases/5-feedback-contact-api/index.json` step 1 갱신.

## 금지사항

- **`/api/node/contact` 라우트 추가 금지** (이 step). 후속 step 3.
- **Edge runtime import 금지.**
- **Resend SDK 추가 금지** (의존성 최소화). fetch 만 사용.
- **이메일 본문 raw HTML allow 금지.** HTML escape 후 안전한 마크업만.
- **이메일에 사용자 IP, 시간대, 브라우저 정확 정보 포함 금지** (이름/이메일/메시지/uaHash 만).
- **rate limit 구현 금지** (후속 task).
- **이메일 발송 실패에 retry 추가 금지.** silent + 단발 시도.
