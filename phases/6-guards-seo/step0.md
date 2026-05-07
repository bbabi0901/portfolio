# Step 0: rate-limit-core

## 읽어야 할 파일

- `/CLAUDE.md` — `/api/chat` Edge runtime, `/api/node/*` Node runtime. UPSTASH 환경변수 둘 다 있을 때만 Redis 사용.
- `/docs/ARCHITECTURE.md` — rate-limit.ts 위치 (`lib/`), Edge/Node 양쪽 호환 요구.
- `/docs/ADR.md` — ADR-014 Edge/Node split.
- `/spec.json` — `rateLimits` (chatPerMinute / chatPerDay / feedbackPerMinute / contactPerMinute / contactPerDay).
- `/lib/env.ts` — `getServerEnv()` (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, RATE_LIMIT_BYPASS).
- `/spec.json` `features[]` 의 FEAT-008 (Rate Limit), `errorPolicies[]` ERR-04 / ERR-23.

## 작업

`lib/rate-limit.ts` — 단일 sliding-window rate limit core. Edge & Node 양쪽 호환. Upstash REST API (fetch) 우선, 미설정 시 in-process LRU 폴백. TDD.

### TDD 순서

1. `specs/rate-limit.spec.ts` 작성 (실패).
2. `lib/rate-limit.ts` 구현 (통과).

### 시그니처

```ts
// lib/rate-limit.ts

export interface RateLimitInput {
  key: string;                   // 보통 `${route}:${ip-or-hash}`
  limit: number;                 // 윈도우 내 허용 카운트
  windowSeconds: number;         // 60 (분), 86400 (일)
  /** 호출 시점. 테스트에서 injectable. 기본 Date.now(). */
  now?: number;
}

export interface RateLimitOk { ok: true;  remaining: number; resetAt: number }
export interface RateLimitDeny { ok: false; remaining: 0; resetAt: number; retryAfter: number /* seconds */ }

export type RateLimitDecision = RateLimitOk | RateLimitDeny;

/**
 * Sliding-window rate limit 검사.
 *  - RATE_LIMIT_BYPASS=1 → 항상 ok (dev/CI).
 *  - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 모두 있으면 Upstash REST 사용.
 *  - 그 외 → 메모리 LRU (인스턴스 격리, best-effort).
 *
 * key 는 호출자가 충돌 없이 구성. 권장: `chat:${ipHash}`, `feedback:${ipHash}`.
 */
export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitDecision>;

/** 테스트용: 메모리 store 초기화. */
export function clearRateLimitMemory(): void;

/** 헬퍼: req 의 X-Forwarded-For/X-Real-IP/CF-Connecting-IP 등에서 IP 추출. */
export function getClientIp(req: Request): string;

/** 헬퍼: IP 를 sha256 해시 (개인식별 회피). 8 hex char 반환. Edge crypto.subtle 사용. */
export async function hashIp(ip: string): Promise<string>;
```

### Sliding-window 알고리즘

1. 키별로 timestamps[] (epoch ms) 저장.
2. `now - windowSeconds*1000` 이전 timestamps 제거.
3. 남은 length < limit → 추가 + ok.
4. 그 외 → deny + retryAfter = ceil((oldest + windowSeconds*1000 - now) / 1000).

### Upstash REST 구현

- Pipeline 으로 ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE 한 번에 수행.
- key prefix: `rl:${userKey}` (충돌 회피).
- timestamp value 와 score 모두 `now` (ms) 사용.
- ZCARD 결과 length < limit 이면 ok.

```ts
async function upstashCheck(env: ServerEnv, input: RateLimitInput): Promise<RateLimitDecision> {
  const url = `${env.UPSTASH_REDIS_REST_URL}/pipeline`;
  const cutoff = (input.now ?? Date.now()) - input.windowSeconds * 1000;
  const score = input.now ?? Date.now();
  const key = `rl:${input.key}`;
  const body = [
    ["ZREMRANGEBYSCORE", key, "-inf", String(cutoff - 1)],
    ["ZADD", key, String(score), `${score}:${Math.random()}`],   // 고유 member
    ["ZCARD", key],
    ["EXPIRE", key, String(input.windowSeconds + 1)],
  ];
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  /* parse [ {result: 0}, {result: 1}, {result: count}, {result: 1} ] */
}
```

- Upstash 응답 실패 (timeout, 5xx, network) → 메모리 폴백 + warn log (token 노출 X).

### 메모리 폴백

```ts
const STORE = new Map<string, number[]>();
const MAX_KEYS = 5000;          // LRU cap

function memoryCheck(input: RateLimitInput): RateLimitDecision {
  const now = input.now ?? Date.now();
  const cutoff = now - input.windowSeconds * 1000;
  // LRU eviction (oldest)
  if (STORE.size >= MAX_KEYS) STORE.delete(STORE.keys().next().value!);
  const ts = (STORE.get(input.key) ?? []).filter((t) => t >= cutoff);
  if (ts.length >= input.limit) {
    const oldest = ts[0]!;
    return { ok: false, remaining: 0, resetAt: oldest + input.windowSeconds * 1000,
             retryAfter: Math.ceil((oldest + input.windowSeconds * 1000 - now) / 1000) };
  }
  ts.push(now);
  STORE.set(input.key, ts);
  return { ok: true, remaining: input.limit - ts.length, resetAt: now + input.windowSeconds * 1000 };
}
```

### Specs (TDD red)

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { server } from "@/tests/msw/server";
import { http, HttpResponse } from "msw";
import { checkRateLimit, clearRateLimitMemory, getClientIp, hashIp } from "@/lib/rate-limit";

describe("checkRateLimit (memory fallback)", () => {
  beforeEach(() => clearRateLimitMemory());

  it("limit=3 → 3회 ok, 4회째 deny + retryAfter", async () => { /* … */ });
  it("windowSeconds 경과 후 다시 ok", async () => { /* now injection */ });
  it("key 다르면 격리", async () => { /* … */ });
  it("LRU eviction (5001+ keys)", async () => { /* … */ });
  it("RATE_LIMIT_BYPASS=1 → 항상 ok", async () => { /* … */ });
});

describe("checkRateLimit (Upstash)", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "redis-token";
  });
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("정상 응답 (ZCARD < limit) → ok", async () => {
    server.use(http.post("https://test.upstash.io/pipeline", () =>
      HttpResponse.json([{ result: 0 }, { result: 1 }, { result: 1 }, { result: 1 }])));
    /* … */
  });

  it("ZCARD >= limit → deny + retryAfter > 0", async () => { /* … */ });
  it("Upstash 5xx → 메모리 폴백", async () => { /* … */ });
  it("Upstash timeout (mocked) → 메모리 폴백", async () => { /* … */ });
  it("Upstash 응답에 token 누설 X (응답 의 string 내 token 미포함)", async () => { /* … */ });
});

describe("getClientIp", () => {
  it("X-Forwarded-For 우선", () => { /* … */ });
  it("CF-Connecting-IP", () => { /* … */ });
  it("X-Real-IP", () => { /* … */ });
  it("부재 시 'unknown'", () => { /* … */ });
});

describe("hashIp", () => {
  it("sha256 → 8 hex char", async () => { /* … */ });
  it("동일 input → 동일 output (deterministic)", async () => { /* … */ });
  it("다른 input → 다른 output", async () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **Edge & Node 양쪽 호환.** `crypto.subtle` 사용 (Node 20+ 도 지원, Edge 도 지원). `node:crypto` 직접 import 금지.
- **secret 누설 방지**: Upstash error log 에서 token 마스킹.
- **메모리 폴백은 인스턴스 격리.** Vercel 의 multiple lambda 인스턴스 → 합산 카운트 없음. best-effort 허용.
- **RATE_LIMIT_BYPASS 는 dev 전용 신호.** production 에서 1 로 설정해도 동작하도록 함 (운영자 책임).
- **timestamps[] 의 LRU eviction 은 globally LRU (Map insertion order)**. 키별 length cap 은 별도로 cap 안 함.

## Acceptance Criteria

```bash
npm run check:spec
npm run lint
npm run test -- specs/rate-limit.spec.ts
npx tsc --noEmit
```

## 검증 절차

1. AC 실행.
2. 체크:
   - `lib/rate-limit.ts`, spec 파일 존재.
   - 모든 spec 통과 (특히 Upstash msw mock + 메모리 폴백).
   - `grep -nE "from ['\"]node:" lib/rate-limit.ts` → 0건.
   - Upstash error log 에 token 누설 없음.
3. `phases/6-guards-seo/index.json` step 0 갱신.

## 금지사항

- **route 에 부착하지 마라** (이 step). 후속 step 1.
- **`@upstash/redis` SDK 추가 금지.** fetch 만 사용 (Edge 호환 + 의존성 최소화).
- **fixed-window 구현 금지** (sliding 만). 이유: thundering herd.
- **Date.now() 직접 호출 외 시간 source 추가 금지** (Date 만, now injection 으로 testable).
- **`process.env.X` 직접 참조 금지.** getServerEnv 만.
- **token-budget 또는 daily cap 구현 금지.** 후속 step 2.
