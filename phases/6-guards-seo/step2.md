# Step 2: token-budget

## 읽어야 할 파일

- `/CLAUDE.md` — `MAX_TOKENS_PER_DAY` 환경변수 (기본 200000).
- `/spec.json` — `errorPolicies[]` ERR-16 (일별 토큰 한도 초과 → 사이트 전체 503).
- `/lib/env.ts` — getServerEnv MAX_TOKENS_PER_DAY.
- `/lib/rate-limit.ts` — Upstash REST + 메모리 LRU 패턴 (재사용).
- `/lib/models.ts` — ModelSpec.maxOutputTokens.
- `/app/api/[[...route]]/route.ts` — chat 라우트 (응답 후 토큰 합산).

## 작업

`lib/token-budget.ts` — 일별 토큰 합산 + cap 검사. chat 라우트에서 응답 완료 시 token 합산. cap 초과 시 503 분기.

### TDD 순서

1. `specs/token-budget.spec.ts` 작성 (실패).
2. `lib/token-budget.ts` 구현 + chat 라우트 통합 (통과).

### 시그니처

```ts
// lib/token-budget.ts

export interface TokenUsage { promptTokens: number; completionTokens: number }

/** 오늘(KST) 누적 사용량 조회. RATE_LIMIT_BYPASS=1 → 항상 0. */
export async function getTodayUsage(now?: number): Promise<number>;

/** 토큰 합산. Upstash 가능하면 INCRBY, 아니면 메모리. */
export async function addTokenUsage(usage: TokenUsage, now?: number): Promise<void>;

/**
 * 일별 cap 검사.
 * @returns ok=true 면 통과, ok=false 면 cap 초과.
 */
export async function checkDailyTokenBudget(now?: number): Promise<{
  ok: boolean;
  used: number;
  cap: number;
  resetAt: number;     // 자정(KST) ms
}>;

export function getKstDayKey(now?: number): string;     // "tk:YYYY-MM-DD" — KST
```

### 핵심 동작

- **KST 기준 일별 키**: `tk:YYYY-MM-DD` (Asia/Seoul).
- **Upstash**: INCRBY 후 EXPIRE day_ttl. fallback → in-process Map.
- **chat 라우트 통합**:
  - 라우트 시작 시점에 `checkDailyTokenBudget()` → !ok → 503 + Retry-After (자정까지).
  - 응답 완료 시 (streamText 의 `onFinish` callback 또는 `result.usage`) → `addTokenUsage(usage)`.
  - `MOCK_LLM=1` → mock usage (e.g. 100 tokens) 사용.
- **`/api/maintenance` 페이지 redirect** 는 후속 step 4. 이 step 에서는 503 응답만.

### Specs (TDD red)

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { addTokenUsage, getTodayUsage, checkDailyTokenBudget, getKstDayKey } from "@/lib/token-budget";

describe("getKstDayKey", () => {
  it("UTC 14:00 → KST 23:00 → '2026-05-07'", () => { /* … */ });
  it("UTC 15:00 → KST 00:00 → '2026-05-08'", () => { /* … */ });
});

describe("token budget (memory)", () => {
  beforeEach(() => {
    process.env.MAX_TOKENS_PER_DAY = "1000";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.RATE_LIMIT_BYPASS;
  });

  it("초기 사용량 0, ok=true", async () => { /* … */ });
  it("addTokenUsage 후 누적", async () => { /* … */ });
  it("cap 초과 → ok=false + resetAt 자정 KST", async () => { /* … */ });
  it("RATE_LIMIT_BYPASS=1 → 항상 ok=true + used=0", async () => { /* … */ });
  it("KST 자정 경과 → 새 day key, used=0", async () => { /* fake timer */ });
});

describe("token budget (Upstash)", () => {
  beforeEach(() => {
    process.env.MAX_TOKENS_PER_DAY = "1000";
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  });

  it("INCRBY pipeline 정상 → ok", async () => { /* msw mock */ });
  it("Upstash 5xx → 메모리 폴백 + log warn", async () => { /* … */ });
});

describe("/api/chat 토큰 cap 통합", () => {
  beforeEach(() => {
    process.env.MAX_TOKENS_PER_DAY = "100";
    process.env.MOCK_LLM = "1";
    process.env.OPENAI_API_KEY = "sk";
  });

  it("cap 초과 (used 100, +1) → 503 + Retry-After", async () => { /* … */ });
  it("정상 응답 후 addTokenUsage 호출 (used 누적)", async () => { /* mock usage 100 */ });
});
```

### 핵심 규칙 (위반 금지)

- **KST 기준 day key.** UTC 사용 X (사용자 명시). `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)` 패턴.
- **Upstash 미설정 시 메모리.** 인스턴스 격리 → 운영에선 사실상 cap 정확도 낮음. 운영 정확도 위해선 Upstash 권장 (운영자 책임).
- **Edge runtime 호환.** Node-only 모듈 X.
- **MAX_TOKENS_PER_DAY=0 설정 시 즉시 cap (테스트 가능).**
- **chat 라우트 통합 시 응답 도중 cap 초과해도 진행 중 응답은 끝까지 stream.** addTokenUsage 만 누적.
- **사용량 응답에 노출 금지** (응답 body 에 used 포함 X). 헤더 X-Token-Budget-Remaining 도 X (디버깅 시 토큰 노출).

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
   - `lib/token-budget.ts`, spec 파일 존재.
   - chat 라우트 통합 (cap 검사 + addTokenUsage).
   - 모든 spec 통과.
   - 회귀: chat-route / injection-defense 등 모두 통과.
3. `phases/6-guards-seo/index.json` step 2 갱신.

## 금지사항

- **rate-limit core 변경 금지** (이 step). 별도 모듈.
- **maintenance 페이지 추가 금지** (후속 step 4).
- **운영자 알림 (Slack, Discord webhook) 추가 금지** (MVP 외).
- **Upstash redis 의 EXPIRE 누락 금지.** 누적 키가 영구 보존되면 메모리 누수.
- **token usage 를 client 응답 body 에 echo back 금지.**
