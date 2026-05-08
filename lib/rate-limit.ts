import { getServerEnv } from "@/lib/env";

export interface RateLimitInput {
  key: string;
  limit: number;
  windowSeconds: number;
  /** Injectable for tests. Default Date.now(). */
  now?: number;
}

export interface RateLimitOk {
  ok: true;
  remaining: number;
  resetAt: number;
}

export interface RateLimitDeny {
  ok: false;
  remaining: 0;
  resetAt: number;
  /** Seconds until the oldest entry in the window expires. */
  retryAfter: number;
}

export type RateLimitDecision = RateLimitOk | RateLimitDeny;

const MAX_KEYS = 5000;
const STORE = new Map<string, number[]>();

export function clearRateLimitMemory(): void {
  STORE.clear();
}

function memoryCheck(input: RateLimitInput): RateLimitDecision {
  const now = input.now ?? Date.now();
  const cutoff = now - input.windowSeconds * 1000;

  const existing = STORE.get(input.key);
  if (existing) STORE.delete(input.key);

  while (STORE.size >= MAX_KEYS) {
    const firstKey = STORE.keys().next().value;
    if (firstKey === undefined) break;
    STORE.delete(firstKey);
  }

  const ts = (existing ?? []).filter((t) => t >= cutoff);

  if (ts.length >= input.limit) {
    const oldest = ts[0]!;
    const resetAt = oldest + input.windowSeconds * 1000;
    STORE.set(input.key, ts);
    return {
      ok: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  ts.push(now);
  STORE.set(input.key, ts);
  return {
    ok: true,
    remaining: input.limit - ts.length,
    resetAt: now + input.windowSeconds * 1000,
  };
}

interface UpstashEntry {
  result?: unknown;
  error?: string;
}

async function upstashCheck(
  baseUrl: string,
  token: string,
  input: RateLimitInput,
): Promise<RateLimitDecision> {
  const now = input.now ?? Date.now();
  const cutoff = now - input.windowSeconds * 1000;
  const member = `${now}:${Math.random().toString(36).slice(2)}`;
  const key = `rl:${input.key}`;

  const body: Array<Array<string | number>> = [
    ["ZREMRANGEBYSCORE", key, "-inf", String(cutoff - 1)],
    ["ZADD", key, String(now), member],
    ["ZCARD", key],
    ["EXPIRE", key, String(input.windowSeconds + 1)],
  ];

  const res = await fetch(`${baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`upstash http ${res.status}`);
  }

  const data = (await res.json()) as UpstashEntry[];
  if (!Array.isArray(data) || data.length < 3) {
    throw new Error("upstash invalid response shape");
  }
  const zcardEntry = data[2]!;
  if (zcardEntry.error) {
    throw new Error("upstash command error");
  }
  const raw = zcardEntry.result;
  const count = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(count)) {
    throw new Error("upstash invalid ZCARD");
  }

  if (count < input.limit) {
    return {
      ok: true,
      remaining: input.limit - count,
      resetAt: now + input.windowSeconds * 1000,
    };
  }
  return {
    ok: false,
    remaining: 0,
    resetAt: now + input.windowSeconds * 1000,
    retryAfter: input.windowSeconds,
  };
}

export async function checkRateLimit(
  input: RateLimitInput,
): Promise<RateLimitDecision> {
  const env = getServerEnv();

  if (env.RATE_LIMIT_BYPASS === "1") {
    const now = input.now ?? Date.now();
    return {
      ok: true,
      remaining: input.limit,
      resetAt: now + input.windowSeconds * 1000,
    };
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashCheck(
        env.UPSTASH_REDIS_REST_URL,
        env.UPSTASH_REDIS_REST_TOKEN,
        input,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.warn(`[rate-limit] upstash failed, falling back to memory: ${msg}`);
      return memoryCheck(input);
    }
  }

  return memoryCheck(input);
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) {
    const trimmed = cf.trim();
    if (trimmed) return trimmed;
  }
  const real = req.headers.get("x-real-ip");
  if (real) {
    const trimmed = real.trim();
    if (trimmed) return trimmed;
  }
  return "unknown";
}

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
