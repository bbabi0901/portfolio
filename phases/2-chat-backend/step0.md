# Step 0: env-and-models

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` — CRITICAL: API 키는 환경변수, 클라이언트 번들에 포함 금지. `/api/chat` 은 Edge runtime.
- `/docs/ADR.md` — ADR-003 Vercel AI SDK 멀티 프로바이더, ADR-014 Edge/Node split.
- `/docs/AI_CONTRACT.md` — 모델별 maxOutputTokens, temperature, topP 정책.
- `/docs/ARCHITECTURE.md` — `lib/` 디렉토리 구조 + Edge runtime 제약.
- `/.env.local.example` — 환경변수 명세 (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MAX_TOKENS_PER_DAY 등).
- `/spec.json` — `models[]` 필드 (모델 ID, provider, default, maxOutputTokens).
- `/lib/spec-schema.ts` — `ModelSchema` 정의 (이전 task 산출물).

이 step 은 이후 모든 chat-backend step 의 기반이다. 환경변수 로드와 모델 팩토리를 가장 먼저.

## 작업

`lib/env.ts` (Edge-safe 환경변수 zod wrap) 와 `lib/models.ts` (AI SDK 모델 팩토리 + 화이트리스트) 를 만든다. TDD 순서: 실패 spec → 통과 구현.

### TDD 순서 (강제)

1. `spec.json` 의 `features[]` 에 **FEAT-001 Multi-model Chat** 항목 확인. 존재하지 않으면 추가하지 말고 현재 spec 그대로 사용 (이미 등록되어 있음).
2. `specs/models.spec.ts` 작성 (실패).
3. `lib/env.ts` + `lib/models.ts` 구현 (통과).

### 생성할 파일

#### 1. `lib/env.ts` (Edge-safe 환경변수)

```ts
import { z } from "zod";

const ServerEnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAX_TOKENS_PER_DAY: z.coerce.number().int().positive().default(200_000),
  RATE_LIMIT_BYPASS: z.string().optional(),
  MOCK_LLM: z.string().optional(),
  MOCK_NOTION: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = ServerEnvSchema.parse(process.env);
  return cached;
}

export function clearEnvCache(): void {
  cached = null;
}
```

- Edge 호환: `node:fs` 사용 X. `process.env` 직접 접근만.
- 캐시: 같은 instance 내 재호출 시 reparse 안 함.
- 누락된 키는 optional → 호출 측에서 null check.

#### 2. `lib/models.ts` (AI SDK 모델 팩토리)

```ts
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { getServerEnv } from "./env";

export type ModelId = "gpt-4o-mini" | "claude-3-5-haiku-latest" | "gemini-2.0-flash-exp";
export type Provider = "openai" | "anthropic" | "google";

export interface ModelSpec {
  id: ModelId;
  provider: Provider;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
}

export const DEFAULT_MODEL_ID: ModelId = "gpt-4o-mini";

const REGISTRY: Record<ModelId, ModelSpec> = {
  /* AI_CONTRACT.md 의 권장 값 (temp 0.3, topP 0.9, maxOutputTokens 1024) 적용 */
};

export function isKnownModel(id: string): id is ModelId { /* 화이트리스트 검사 */ }

export function resolveModel(id: string | null | undefined): ModelSpec {
  /* 알 수 없는 ID 또는 null → DEFAULT_MODEL_ID 로 강등. 콘솔 warn. */
}

/**
 * Provider API 키 부재 시 throw. 호출측에서 catch 후 fallback 모델로 재시도.
 * MOCK_LLM=1 이면 deterministic mock model 반환 (tests 용도).
 */
export function createModel(spec: ModelSpec): LanguageModel { /* AI SDK provider 인스턴스 → model() */ }

export function listAvailableModels(): ModelSpec[] {
  /* 환경변수에 API 키가 있는 provider 의 모델만 노출 */
}
```

- **MOCK_LLM=1**: 결정적 mock LanguageModel 반환. msw 와 별개로 SDK 단계에서 차단.
  - mock 응답: 사용자 메시지 마지막 문장을 그대로 반향(echo) + `[mock-llm]` 접두. 토큰 stream 시뮬레이션.
- API 키 부재 → `Error("provider:<provider> API key not set")` throw.
- 화이트리스트 외 ID → `DEFAULT_MODEL_ID` 로 강등 + `console.warn("[models] unknown model id %s, falling back to %s", id, DEFAULT_MODEL_ID)`.

#### 3. `specs/models.spec.ts` (TDD red 단계)

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("lib/models", () => {
  beforeEach(() => { /* env reset */ });
  it("resolveModel: 알 수 없는 ID → DEFAULT_MODEL_ID", () => { /* … */ });
  it("resolveModel: null → DEFAULT_MODEL_ID", () => { /* … */ });
  it("isKnownModel: 화이트리스트 3종 true", () => { /* … */ });
  it("isKnownModel: 임의 문자열 false", () => { /* … */ });
  it("listAvailableModels: 모든 키 부재 시 빈 배열", () => { /* … */ });
  it("listAvailableModels: OPENAI_API_KEY 만 → gpt-4o-mini 만 노출", () => { /* … */ });
  it("createModel: API 키 부재 시 throw", () => { /* … */ });
  it("createModel: MOCK_LLM=1 시 mock 모델 반환", async () => { /* generate mock → text 검증 */ });
});
```

테스트 파일을 spec.json `features[].tests` 에 매핑하고 `npm run check:spec` 통과.

### 핵심 규칙 (위반 금지)

- **Edge runtime 호환만.** `node:fs`, `node:crypto` 등 Node-only 모듈 import 금지.
- **API 키를 클라이언트 번들에 노출 금지.** `lib/env.ts` 는 server-only context 에서만 호출.
- **모델 ID 검증 없이 LLM 호출 금지.** `resolveModel()` 거쳐야 함.
- **AI SDK 의존성**: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `ai` 모두 이전 task 에서 추가됨. 추가 install 불필요.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/models.spec.ts
npx tsc --noEmit
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `lib/env.ts`, `lib/models.ts`, `specs/models.spec.ts` 존재.
   - models.spec.ts 8 케이스 모두 통과.
   - Edge runtime 호환 확인 (`grep -nE "from ['\"](node:|fs|child_process)['\"]" lib/env.ts lib/models.ts` 결과 0).
   - spec.json `features[]` 의 FEAT-001 `tests[]` 에 `specs/models.spec.ts` 가 있어야 함.
3. `phases/2-chat-backend/index.json` step 0 갱신.

## 금지사항

- **`process.env.X` 직접 사용 금지** (lib/models.ts 내부에서). 이유: env 변경 시 cache 통제 어려움. `getServerEnv()` 만 사용.
- **API 키를 default 값 fallback 금지** (`OPENAI_API_KEY: z.string().default("...")` 같은). 이유: 보안.
- **`any` 캐스팅 금지** (특히 `LanguageModel` 타입). 이유: TS strict.
- **MOCK_LLM 분기 외 mock 코드를 production 빌드에 포함 금지.** 이유: 번들 sizing.
- **새 모델 추가 시 spec.json 의 `models[]` 와 동기화 필수.** 이 step 에서는 spec.json 을 수정하지 마라 (이미 3 종 등록됨).
