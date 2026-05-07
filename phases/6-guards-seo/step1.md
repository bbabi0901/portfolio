# Step 1: rate-limit-routes

## 읽어야 할 파일

- `/CLAUDE.md` — `/api/chat` Edge runtime, `/api/node/*` Node runtime.
- `/spec.json` — `rateLimits` (chatPerMinute / chatPerDay / feedbackPerMinute / contactPerMinute / contactPerDay), `errorPolicies[]` ERR-04 / ERR-23.
- `/lib/rate-limit.ts` — 이전 step 0 의 checkRateLimit / getClientIp / hashIp.
- `/app/api/[[...route]]/route.ts` (Edge) — chat 라우트.
- `/app/api/node/[[...route]]/route.ts` (Node) — feedback / contact 라우트.

## 작업

3 라우트에 rate limit 미들웨어 부착. TDD.

### TDD 순서

1. `specs/rate-limit-routes.spec.ts` 작성 (실패).
2. 라우트 미들웨어 부착 (통과).

### 적용 정책 (spec.json `rateLimits`)

- `/api/chat`: minute=10, day=100. key = `chat:${ipHash}`.
- `/api/node/feedback`: minute=5, day=30. key = `feedback:${ipHash}`.
- `/api/node/contact`: minute=3, day=10. key = `contact:${ipHash}`.

### 미들웨어 시그니처

```ts
// lib/rate-limit-middleware.ts
import { checkRateLimit, getClientIp, hashIp } from "./rate-limit";
import type { Context } from "hono";

export interface RateLimitMiddlewareOpts {
  routeKey: "chat" | "feedback" | "contact";
  perMinute: number;
  perDay: number;
}

/**
 * 미들웨어. 동일 IP 가 minute / day 둘 다 cap 안에 있어야 통과.
 * 둘 중 하나 deny → 429 + Retry-After (작은 값) 응답.
 */
export function rateLimitMiddleware(opts: RateLimitMiddlewareOpts) {
  return async (c: Context, next: () => Promise<void>) => {
    const ip = getClientIp(c.req.raw);
    const ipHash = await hashIp(ip);
    const minuteRes = await checkRateLimit({ key: `${opts.routeKey}:${ipHash}:m`, limit: opts.perMinute, windowSeconds: 60 });
    if (!minuteRes.ok) {
      return c.json({ error: "rate_limited", scope: "minute" }, 429, {
        "Retry-After": String(minuteRes.retryAfter),
        "X-RateLimit-Scope": "minute",
      });
    }
    const dayRes = await checkRateLimit({ key: `${opts.routeKey}:${ipHash}:d`, limit: opts.perDay, windowSeconds: 86400 });
    if (!dayRes.ok) {
      return c.json({ error: "rate_limited", scope: "day" }, 429, {
        "Retry-After": String(dayRes.retryAfter),
        "X-RateLimit-Scope": "day",
      });
    }
    await next();
  };
}
```

### 적용

Hono 의 `app.use("/chat", rateLimitMiddleware({ ... }))` 또는 라우트별 inline:

```ts
// Edge
app.post("/chat",
  rateLimitMiddleware({ routeKey: "chat", perMinute: 10, perDay: 100 }),
  async (c) => { /* 기존 핸들러 */ });

// Node
app.post("/feedback",
  rateLimitMiddleware({ routeKey: "feedback", perMinute: 5, perDay: 30 }),
  async (c) => { /* 기존 핸들러 */ });

app.post("/contact",
  rateLimitMiddleware({ routeKey: "contact", perMinute: 3, perDay: 10 }),
  async (c) => { /* 기존 핸들러 */ });
```

### Specs (TDD red)

```ts
// specs/rate-limit-routes.spec.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clearRateLimitMemory } from "@/lib/rate-limit";

describe("rateLimit /api/chat", () => {
  beforeEach(() => {
    clearRateLimitMemory();
    process.env.MOCK_LLM = "1";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.RATE_LIMIT_BYPASS;
    delete process.env.UPSTASH_REDIS_REST_URL;
  });

  it("11회째 minute deny → 429 + Retry-After + scope=minute", async () => { /* … */ });
  it("동일 IP 다른 라우트는 격리", async () => { /* … */ });
  it("다른 IP 는 격리 (X-Forwarded-For)", async () => { /* … */ });
  it("RATE_LIMIT_BYPASS=1 시 모두 ok", async () => { /* … */ });
});

describe("rateLimit /api/node/feedback", () => {
  it("6회째 minute deny", async () => { /* … */ });
  it("31회째 day deny (시간 mock)", async () => { /* fake timer */ });
});

describe("rateLimit /api/node/contact", () => {
  it("4회째 minute deny", async () => { /* … */ });
  it("11회째 day deny", async () => { /* … */ });
});
```

### 핵심 규칙 (위반 금지)

- **Edge runtime 의 chat 라우트는 `c.req.raw` 로 Web Request 객체 사용.** `req.ip` 같은 Node-only 필드 X.
- **IP 없을 때 'unknown' 키로 통합.** 즉 IP 미식별 사용자는 한 그룹으로 묶임 (NAT 우회 방지 정책).
- **Retry-After 는 두 cap 중 짧은 시간**.
- **rate_limited 응답 body 에 정확 IP/key 포함 금지.** scope 만.
- **rate limit 실패 (Upstash unreachable) → fail-open** (메모리 폴백 → ok). 이유: 외부 의존성 다운 시 사용자 차단보다 통과 우선.

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
   - 3 라우트 미들웨어 부착.
   - 모든 spec 통과.
   - 기존 chat-route / feedback-route / contact-route spec 회귀 통과.
   - 429 응답에 IP/key 누설 없음.
3. `phases/6-guards-seo/index.json` step 1 갱신.

## 금지사항

- **다른 라우트 (health 등) 에 미들웨어 부착 금지.** 이유: 적용 범위 명확화.
- **`/api/chat` placeholder 외 다른 핸들러 변경 금지.** 미들웨어만 추가.
- **fail-closed 정책 (Upstash 다운 시 차단) 사용 금지.** 사용자 경험 우선.
- **client 측 rate limit 표시 추가 금지** (이 step). UI 변경은 별개.
- **token-budget 합치지 마라.** 후속 step 2.
