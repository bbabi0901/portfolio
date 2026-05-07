# Step 4: ui-wiring

## 읽어야 할 파일

- `/CLAUDE.md` — 클라이언트는 `/api/*` 만 호출, 같은 origin.
- `/spec.json` — `features[]` FEAT-004 (Feedback), FEAT-026 (Contact), `errorPolicies[]` ERR-09 / ERR-21 / ERR-23.
- `/components/chat/FeedbackPopover.tsx`, `FeedbackButtons.tsx` — 이전 task `3-chat-ui` 의 controlled UI.
- `/components/contact/ContactForm.tsx`, `ContactClient.tsx` — 이전 task `4-pages-side-menu` 의 mock onSubmit.
- `/components/chat/ChatRoot.tsx` — 이전 task `3-chat-ui`. FeedbackPopover 제어 + onSubmit 콜백.
- `/types/feedback.ts` — 이전 step 0.
- `/lib/contact-schema.ts` — 이전 task 4.

## 작업

UI 측에서 이전 step 의 실제 endpoint (`/api/node/feedback`, `/api/node/contact`) 를 호출하도록 wiring. ERR 매핑 토스트.

### TDD 순서

1. `specs/components/feedback-wiring.spec.tsx` + `specs/components/contact-wiring.spec.tsx` 작성 (실패).
2. 컴포넌트 콜백 교체 (통과).

### 변경 파일

#### 1. `components/chat/ChatRoot.tsx` — feedback 호출 추가

기존 `onFeedback?: (messageId, kind) => void` 콜백을 `/api/node/feedback` POST 로 교체.

```tsx
async function handleFeedback(messageId: string, kind: "up" | "down", popoverData?: { reason: FeedbackReason; reasonDetail?: string }) {
  // 👍: kind="up". popoverData 없음. 단순 토스트.
  // 👎: kind="down" + popoverData 필수. /api/node/feedback POST.
  if (kind === "up") {
    toast.success("고마워요!");
    return;
  }
  if (!popoverData) return;

  const target = allMessages.find(m => m.id === messageId);
  const userMsg = findPrecedingUserMessage(allMessages, messageId);
  if (!target || !userMsg) return;

  setBusy(true);
  try {
    const res = await fetch("/api/node/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId,
        question: userMsg.content,
        answer: target.content,
        reason: popoverData.reason,
        reasonDetail: popoverData.reasonDetail,
        model: modelId,
        retrievalChunkTitles: target.citations?.map(c => c.sourceTitle) ?? [],
      }),
    });
    if (res.ok) {
      markFeedbackSent(messageId);
      toast.success("고마워요, 보강할게요");
      return;
    }
    if (res.status === 503) toast.error("피드백이 일시적으로 사용 불가에요");
    else if (res.status === 422) toast.error("요청을 처리할 수 없어요");
    else if (res.status === 429) toast.error("잠시 후 다시 시도해 주세요");
    else toast.error("전송 실패. 잠시 후 다시 시도해 주세요");
  } catch {
    toast.error("인터넷 연결을 확인해 주세요");
  } finally {
    setBusy(false);
  }
}
```

- `markFeedbackSent` 는 message state 의 `feedbackSent: true` 설정 → FeedbackButtons disabled.
- 동일 메시지 두 번째 클릭 차단 (FeedbackButtons.alreadySent).
- 60초 5건 rate limit 은 후속 task 라 클라이언트 측 추가 X. 서버 429 만 처리.

#### 2. `components/contact/ContactClient.tsx` — onSubmit 호출 교체

```tsx
"use client";
import { useRef } from "react";
import { ContactForm } from "./ContactForm";
import { DirectContactCard } from "./DirectContactCard";
import { toast } from "sonner";

export function ContactClient({ email, github, linkedin }: ContactClientProps) {
  const mountedAtRef = useRef<number>(Date.now());

  async function submit(values: ContactInput) {
    const elapsedMs = Date.now() - mountedAtRef.current;
    try {
      const res = await fetch("/api/node/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, elapsedMs }),
      });
      if (res.ok) {
        toast.success("메시지를 받았어요. 빠르게 회신할게요.");
        return { ok: true } as const;
      }
      const json = await res.json().catch(() => ({}));

      if (res.status === 503 && json.mailto) {
        toast.error(<MailtoFallback message={json.mailto} />, { duration: 8000 });
        return { ok: false, reason: "503" } as const;
      }
      if (res.status === 502 && json.mailto) {
        toast.error(<MailtoFallback message={json.mailto} />, { duration: 8000 });
        return { ok: false, reason: "502" } as const;
      }
      if (res.status === 422) {
        toast.error("입력값을 확인해 주세요");
        return { ok: false, reason: "422" } as const;
      }
      if (res.status === 429) {
        toast.error("잠시 후 다시 시도해 주세요");
        return { ok: false, reason: "429" } as const;
      }
      toast.error("전송 실패. 잠시 후 다시 시도해 주세요");
      return { ok: false, reason: "unknown" } as const;
    } catch {
      toast.error("인터넷 연결을 확인해 주세요");
      return { ok: false, reason: "network" } as const;
    }
  }

  return (
    <main className="...">
      <DirectContactCard email={email} github={github} linkedin={linkedin} />
      <ContactForm onSubmit={submit} />
    </main>
  );
}

function MailtoFallback({ message }: { message: string }) {
  return (
    <span>
      Notion 저장이 안 됐어요. <a href={message} className="underline">직접 메일 주세요</a>
    </span>
  );
}
```

#### 3. `components/chat/FeedbackPopover.tsx` 호출 시그니처 확인

이전 step 에서 `onSubmit(reason, detail?)` 시그니처로 만들었음. ChatRoot 의 handleFeedback 가 이 콜백을 wrap.

### Specs (TDD red)

```tsx
// specs/components/feedback-wiring.spec.tsx
import { rest, http, HttpResponse } from "msw";
import { server } from "@/tests/msw/server";

describe("ChatRoot feedback wiring", () => {
  it("👍 클릭 → '고마워요!' 토스트, fetch 미호출", async () => { /* … */ });

  it("👎 + reason 제출 → POST /api/node/feedback + 200 → 토스트 + alreadySent", async () => {
    let body: any;
    server.use(http.post("/api/node/feedback", async (info) => {
      body = await info.request.json();
      return HttpResponse.json({ ok: true, notionPageId: "p1" });
    }));
    /* … */
    expect(body.reason).toBe("inaccurate");
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("503 → '일시적으로 사용 불가' 토스트", async () => { /* … */ });
  it("422 → '요청을 처리할 수 없어요' 토스트", async () => { /* … */ });
  it("429 → '잠시 후 다시' 토스트", async () => { /* … */ });
  it("network error → '인터넷 연결' 토스트", async () => { /* … */ });

  it("같은 메시지에 두 번째 클릭 차단 (alreadySent)", async () => { /* … */ });
});
```

```tsx
// specs/components/contact-wiring.spec.tsx
describe("ContactClient submit", () => {
  beforeEach(() => server.use(/* … */));

  it("정상: ok 응답 → '받았어요' 토스트", async () => {
    server.use(http.post("/api/node/contact", () => HttpResponse.json({ ok: true })));
    /* … */
  });

  it("502 + mailto: → mailto fallback 토스트 (a href)", async () => {
    server.use(http.post("/api/node/contact",
      () => HttpResponse.json({ error: "x", mailto: "mailto:bbabi0901@gmail.com" }, { status: 502 })));
    /* render → submit → toast 안에 a href="mailto:bbabi0901@gmail.com" */
  });

  it("503 + mailto → 동일 fallback", async () => { /* … */ });

  it("422 → '입력값 확인' 토스트", async () => { /* … */ });

  it("429 → '잠시 후 다시' 토스트", async () => { /* … */ });

  it("network error → '인터넷 연결' 토스트", async () => { /* … */ });

  it("elapsedMs 계산: mount 후 시간 차이 body 에 포함", async () => {
    let body: any;
    server.use(http.post("/api/node/contact", async (info) => {
      body = await info.request.json();
      return HttpResponse.json({ ok: true });
    }));
    vi.useFakeTimers();
    /* mount, advance 2000ms, submit, expect body.elapsedMs >= 1500 */
  });
});
```

### 핵심 규칙 (위반 금지)

- **`/api/node/feedback` 와 `/api/node/contact` 는 same-origin fetch.** CORS 우회 코드 추가 금지.
- **mailto fallback 의 toast 본문은 a href 가 mailto 형식**. URL 검증 (regex `^mailto:`).
- **client 측 retry 추가 금지.** 서버 502 → 사용자 수동 재시도 (mailto 안내).
- **toast 라이브러리는 sonner 만**.
- **fetch credentials 'include' 사용 금지** (same-origin 자동).
- **client 가 NOTION_TOKEN, RESEND_API_KEY 알 일 없음.** UI 어디에도 이 키 ref 금지.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test
npx tsc --noEmit
SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 npm run build
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `components/chat/ChatRoot.tsx` 의 handleFeedback 가 fetch + ERR 매핑.
   - `components/contact/ContactClient.tsx` 의 submit 이 fetch + mailto fallback.
   - 모든 spec 통과 (feedback + contact wiring).
   - 회귀: 이전 task 의 spec 들 (atoms/messages/composer/contact-form/...) 모두 그대로 통과.
3. `phases/5-feedback-contact-api/index.json` step 4 갱신 (이 task 의 마지막 step).

## 금지사항

- **새 백엔드 라우트 추가 금지** (이 step). 이미 step 2/3 완료.
- **mailto URL 에 사용자 입력 prefill 금지** (open redirect/phishing 방지).
- **client 측 rate limit 구현 금지** (후속 task `6-guards-seo`).
- **`/api/feedback` 직접 path 사용 금지.** Edge 라우트는 chat 만. feedback/contact 은 `/api/node/*`.
- **구버전 mock onSubmit 코드 그대로 두지 마라.** 모두 fetch 로 교체.
- **`window.alert` 사용 금지.** sonner toast 만.
