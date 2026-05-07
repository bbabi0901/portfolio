# Step 3: chat-route

## 읽어야 할 파일

- `/CLAUDE.md` — `/api/chat` 은 Edge runtime, API 키는 클라이언트에 노출 금지.
- `/docs/ARCHITECTURE.md` — 데이터 흐름 (useChat → /api/chat → retriever → AI SDK → SSE). 상태 머신.
- `/docs/ADR.md` — ADR-002 Hono on Route Handler, ADR-003 Vercel AI SDK.
- `/docs/AI_CONTRACT.md` — 응답 SSE 포맷, "기록 없음" 표준 응답.
- `/spec.json` — `features[]` 의 FEAT-001 (Multi-model Chat), FEAT-002 (SSE Streaming), FEAT-006 (RAG), FEAT-007 (System Prompt / Injection Defense).
- `/app/api/[[...route]]/route.ts` — Edge Hono 라우트 (이전 task 에 placeholder 501 존재).
- `/lib/models.ts`, `/lib/prompts.ts`, `/lib/output-filter.ts`, `/lib/retriever.ts`, `/lib/portfolio-data.ts` — 이전 step + 1-content-pipeline.

## 작업

`/api/chat` POST 라우트 구현. retriever → prompts → AI SDK `streamText` → output-filter pipeline. SSE 스트리밍.

### TDD 순서

1. `specs/chat-route.spec.ts` 작성 (실패).
2. `app/api/[[...route]]/route.ts` 의 `/chat` placeholder 를 구현 (통과).

### 라우트 시그니처

```ts
// app/api/[[...route]]/route.ts
// 이미 존재하는 Edge Hono app 에 /chat 라우트만 교체.

import { streamText, convertToCoreMessages } from "ai";
import { z } from "zod";
import { resolveModel, createModel, listAvailableModels, DEFAULT_MODEL_ID } from "@/lib/models";
import { buildSystemPrompt, detectLanguage } from "@/lib/prompts";
import { filterOutput } from "@/lib/output-filter";
import { retrieve } from "@/lib/retriever";

const ChatRequestSchema = z.object({
  modelId: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).min(1).max(50),
});

app.post("/chat", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
  }

  const { modelId, messages } = parsed.data;
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (lastUser.trim().length === 0) {
    return c.json({ error: "empty_message" }, 400);
  }

  // 1. retriever
  const { chunks, mode } = await retrieve(lastUser);

  // 2. 컨텍스트 0 + 점수 모두 낮음 → LLM 호출 없이 즉시 NO_RECORD 응답 (비용 절감 + ERR-08).
  if (chunks.length === 0) {
    const lang = detectLanguage(lastUser);
    const text = lang === "en" ? NO_RECORD_RESPONSE_EN : NO_RECORD_RESPONSE_KO;
    return new Response(/* SSE 형식의 단일 chunk */, { headers: { "X-Retrieval-Mode": mode } });
  }

  // 3. 모델 해결 + API 키 체크 + 401/403 → fallback.
  let spec = resolveModel(modelId ?? DEFAULT_MODEL_ID);
  let model;
  try {
    model = createModel(spec);
  } catch (e) {
    // fallback: 사용 가능한 첫 모델
    const available = listAvailableModels();
    if (available.length === 0) {
      return c.json({ error: "no_models_available" }, 503);
    }
    spec = available[0];
    model = createModel(spec);
  }

  // 4. system prompt
  const language = detectLanguage(lastUser);
  const system = buildSystemPrompt({ chunks, language });

  // 5. streamText
  const result = await streamText({
    model,
    system,
    messages: convertToCoreMessages(messages),
    maxOutputTokens: spec.maxOutputTokens,
    temperature: spec.temperature,
    topP: spec.topP,
  });

  // 6. SSE 스트림에서 토큰을 받아 output-filter 적용 후 client 로 전송.
  //    AI SDK 의 toDataStreamResponse() 가 기본 SSE 스트림. 그 위에 transform 을 씌워야 한다.
  //    구현 방식 (선택):
  //      a. result.textStream → ReadableStream → TransformStream(output-filter) → Response
  //      b. 누적 후 한번에 filter (간단하지만 streaming UX 손실)
  //    추천: a 방식. 줄 단위 buffer 후 filter → emit. Response 헤더 X-Retrieval-Mode, X-Model-Id 포함.
  return /* SSE Response */;
});
```

### 응답 헤더 (필수)

- `Content-Type: text/event-stream` (또는 AI SDK data stream 표준)
- `X-Retrieval-Mode: hybrid | keyword-only`
- `X-Model-Id: gpt-4o-mini | claude-3-5-haiku-latest | gemini-2.0-flash-exp`
- `X-Model-Substitution: true` (모델 강등 발생 시)

### Specs

#### `specs/chat-route.spec.ts` (TDD red)

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { server } from "@/tests/msw/server";
import { http, HttpResponse } from "msw";

describe("/api/chat", () => {
  beforeEach(() => {
    process.env.MOCK_LLM = "1";  // mock model 강제
    process.env.OPENAI_API_KEY = "sk-test";
  });
  afterEach(() => {
    delete process.env.MOCK_LLM;
    delete process.env.OPENAI_API_KEY;
  });

  it("400: empty messages 배열", async () => { /* … */ });
  it("400: 메시지 길이 4001자 초과", async () => { /* … */ });
  it("400: 잘못된 JSON body", async () => { /* … */ });
  it("503: API 키 모두 부재", async () => { /* … */ });
  it("정상: gpt-4o-mini 응답 SSE 스트림", async () => { /* … */ });
  it("정상: 모델 ID 미지정 → DEFAULT_MODEL_ID 사용", async () => { /* … */ });
  it("정상: 화이트리스트 외 모델 ID → DEFAULT_MODEL_ID 강등 + X-Model-Substitution: true", async () => { /* … */ });
  it("retriever 0건 → LLM 호출 없이 NO_RECORD 응답", async () => { /* … */ });
  it("X-Retrieval-Mode 헤더 포함", async () => { /* … */ });
  it("X-Model-Id 헤더 포함", async () => { /* … */ });
  it("output-filter 적용 검증: 외부 URL 마스킹", async () => { /* mock LLM 응답에 외부 URL 포함 → 응답에서 제거 */ });
});
```

라우트 단위 테스트는 Hono app 인스턴스를 직접 import 하여 `app.request("/api/chat", { method: "POST", body, headers })` 로 호출. Vitest + msw 조합.

### 핵심 규칙 (위반 금지)

- **Edge runtime 호환만.** 라우트 파일에 Node-only 모듈 import 금지.
- **API 키 누출 금지.** error response 에 `process.env.X` 절대 포함하지 마라.
- **rate limit 은 이 step 에 포함 X.** FEAT-008 은 후속 task (`6-guards-seo`).
- **stream cleanup**: client abort 시 LLM 호출도 abort. AbortSignal 전파.
- **output-filter 는 line-level**. token 단위 마스킹은 partial leak 위험. line buffer 후 filter.
- **MOCK_LLM=1 일 때**: mock model 이 ai SDK `streamText` 와 호환되는 LanguageModel 인터페이스 구현. step 0 의 mock 그대로.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/chat-route.spec.ts
npx tsc --noEmit
npm run build       # SKIP_NOTION_SYNC=1 MOCK_LLM=1 MOCK_NOTION=1 prebuild 통과
```

수동 dev 서버 검증:
```bash
npm run dev &
sleep 5
curl -sS -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"안녕하세요"}]}' \
  | head -20
kill %1
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `app/api/[[...route]]/route.ts` 의 `/chat` placeholder 가 실제 구현으로 교체.
   - `specs/chat-route.spec.ts` 모든 케이스 통과.
   - Edge runtime 호환 (`grep -nE "from ['\"](node:|fs|child_process|path)['\"]" app/api/\\[\\[...route\\]\\]/route.ts` → 0).
   - SSE 응답이 토큰 단위로 stream 되는지 (mock 모델로 확인).
   - 헤더 X-Retrieval-Mode, X-Model-Id 포함.
3. `phases/2-chat-backend/index.json` step 3 갱신.

## 금지사항

- **`/api/chat` 외 다른 라우트 변경 금지.** 이유: scope 최소화. feedback/contact 는 후속 task.
- **client component 추가 금지.** 이유: 이 step 은 server side only. UI 는 후속 task.
- **임시 디버그 console.log 보존 금지.** 이유: production 로그 노이즈. 구조화 로그는 ARCHITECTURE.md 의 FEAT-012 정책에 따라 별도 logger lib 도입 시점에 추가 (이 step 외).
- **streamText 의 onFinish callback 에서 Notion 또는 외부 호출 금지.** 이유: 이 step 은 chat 만. feedback DB 적재는 후속 task.
- **client 가 model API 키를 보내는 경로 추가 금지.** 이유: CLAUDE.md CRITICAL.
- **AI SDK 의 toolCalls 활성화 금지.** 이유: MVP 외 + 인젝션 surface 확장.
- **LLM 응답을 100% 받기 전에 output-filter 적용 금지** (token 단위 마스킹). 이유: partial regex match 로 false positive/negative. line buffer 단위만.
