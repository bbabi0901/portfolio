import { getServerEnv } from "@/lib/env";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface BudgetCheck {
  ok: boolean;
  used: number;
  cap: number;
  resetAt: number;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SECONDS_PER_DAY = 86_400;
const KEY_TTL_SECONDS = SECONDS_PER_DAY + 120;
const MAX_KEYS = 32;

const MEMORY = new Map<string, number>();

export function clearTokenBudgetMemory(): void {
  MEMORY.clear();
}

export function getKstDayKey(now?: number): string {
  const ms = now ?? Date.now();
  const kst = new Date(ms + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `tk:${y}-${m}-${d}`;
}

function getKstResetAt(ms: number): number {
  const kst = new Date(ms + KST_OFFSET_MS);
  const nextMidnightUtc = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return nextMidnightUtc - KST_OFFSET_MS;
}

function memoryGet(key: string): number {
  return MEMORY.get(key) ?? 0;
}

function memoryAdd(key: string, by: number): void {
  while (MEMORY.size >= MAX_KEYS && !MEMORY.has(key)) {
    const oldest = MEMORY.keys().next().value;
    if (oldest === undefined) break;
    MEMORY.delete(oldest);
  }
  MEMORY.set(key, (MEMORY.get(key) ?? 0) + by);
}

interface UpstashResp {
  result?: unknown;
  error?: string;
}

async function upstashGet(
  baseUrl: string,
  token: string,
  key: string,
): Promise<number> {
  const res = await fetch(`${baseUrl}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`upstash get http ${res.status}`);
  const data = (await res.json()) as UpstashResp;
  if (data.error) throw new Error("upstash get error");
  const raw = data.result;
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function upstashIncrBy(
  baseUrl: string,
  token: string,
  key: string,
  by: number,
  ttlSeconds: number,
): Promise<void> {
  const body: Array<Array<string | number>> = [
    ["INCRBY", key, String(by)],
    ["EXPIRE", key, String(ttlSeconds)],
  ];
  const res = await fetch(`${baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`upstash pipeline http ${res.status}`);
  const data = (await res.json()) as UpstashResp[];
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error("upstash invalid response shape");
  }
  if (data[0]?.error || data[1]?.error) {
    throw new Error("upstash command error");
  }
}

export async function getTodayUsage(now?: number): Promise<number> {
  const env = getServerEnv();
  if (env.RATE_LIMIT_BYPASS === "1") return 0;
  const key = getKstDayKey(now);
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashGet(
        env.UPSTASH_REDIS_REST_URL,
        env.UPSTASH_REDIS_REST_TOKEN,
        key,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.warn(`[token-budget] upstash get failed, falling back: ${msg}`);
    }
  }
  return memoryGet(key);
}

export async function addTokenUsage(
  usage: TokenUsage,
  now?: number,
): Promise<void> {
  const prompt = Number.isFinite(usage.promptTokens) ? usage.promptTokens : 0;
  const completion = Number.isFinite(usage.completionTokens)
    ? usage.completionTokens
    : 0;
  const total = Math.max(0, Math.trunc(prompt + completion));
  if (total === 0) return;

  const env = getServerEnv();
  if (env.RATE_LIMIT_BYPASS === "1") return;

  const key = getKstDayKey(now);
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      await upstashIncrBy(
        env.UPSTASH_REDIS_REST_URL,
        env.UPSTASH_REDIS_REST_TOKEN,
        key,
        total,
        KEY_TTL_SECONDS,
      );
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.warn(`[token-budget] upstash incr failed, falling back: ${msg}`);
    }
  }
  memoryAdd(key, total);
}

export async function checkDailyTokenBudget(
  now?: number,
): Promise<BudgetCheck> {
  const env = getServerEnv();
  const ms = now ?? Date.now();
  const cap = env.MAX_TOKENS_PER_DAY;
  const resetAt = getKstResetAt(ms);

  if (env.RATE_LIMIT_BYPASS === "1") {
    return { ok: true, used: 0, cap, resetAt };
  }

  const used = await getTodayUsage(ms);
  return { ok: used < cap, used, cap, resetAt };
}
