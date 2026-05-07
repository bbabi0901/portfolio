const STORAGE_KEY = "portfolio.greeted";
const FALLBACK_MEMORY: { value: number | null } = { value: null };

export function readGreetedAt(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return FALLBACK_MEMORY.value;
  }
}

export function writeGreetedAt(now: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    FALLBACK_MEMORY.value = now;
  }
}

export function isGreetedRecent(rememberDays: number, now: number = Date.now()): boolean {
  const at = readGreetedAt();
  if (at === null) return false;
  return now - at < rememberDays * 24 * 60 * 60 * 1000;
}

export function __resetGreetingFallback(): void {
  FALLBACK_MEMORY.value = null;
}
