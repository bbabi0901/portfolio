import type { Context, MiddlewareHandler } from "hono";

import { checkRateLimit, getClientIp, hashIp } from "./rate-limit";

export interface RateLimitMiddlewareOpts {
  routeKey: "chat" | "feedback" | "contact";
  perMinute: number;
  perDay: number;
}

/**
 * Hono middleware: enforces both per-minute and per-day caps for the same route+IP.
 * - 429 with Retry-After + X-RateLimit-Scope on deny.
 * - Body never echoes the IP/key — only `scope`.
 * - On unexpected internal errors, fail-open (allow request through). The
 *   underlying checkRateLimit already falls back from Upstash to in-memory.
 */
export function rateLimitMiddleware(opts: RateLimitMiddlewareOpts): MiddlewareHandler {
  return async (c: Context, next: () => Promise<void>) => {
    let ipHash: string;
    try {
      const ip = getClientIp(c.req.raw);
      ipHash = await hashIp(ip);
    } catch {
      await next();
      return;
    }

    let minuteRes;
    try {
      minuteRes = await checkRateLimit({
        key: `${opts.routeKey}:${ipHash}:m`,
        limit: opts.perMinute,
        windowSeconds: 60,
      });
    } catch {
      await next();
      return;
    }
    if (!minuteRes.ok) {
      return c.json({ error: "rate_limited", scope: "minute" }, 429, {
        "Retry-After": String(minuteRes.retryAfter),
        "X-RateLimit-Scope": "minute",
      });
    }

    let dayRes;
    try {
      dayRes = await checkRateLimit({
        key: `${opts.routeKey}:${ipHash}:d`,
        limit: opts.perDay,
        windowSeconds: 86400,
      });
    } catch {
      await next();
      return;
    }
    if (!dayRes.ok) {
      return c.json({ error: "rate_limited", scope: "day" }, 429, {
        "Retry-After": String(dayRes.retryAfter),
        "X-RateLimit-Scope": "day",
      });
    }

    await next();
  };
}
