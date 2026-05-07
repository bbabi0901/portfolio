const WORD_REGEX = /[a-zA-Z0-9]+|[\uac00-\ud7af]+/g;
const KOREAN_REGEX = /[\uac00-\ud7af]/g;

function isKorean(token: string): boolean {
  return /^[\uac00-\ud7af]+$/.test(token);
}

export function tokenize(text: string): string[] {
  if (text.length === 0) return [];
  const matches = text.match(WORD_REGEX) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    const lower = raw.toLowerCase();
    if (isKorean(lower)) {
      if (lower.length >= 2) out.push(lower);
    } else if (lower.length >= 3) {
      out.push(lower);
    }
  }
  return out;
}

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  const koreanChars = (text.match(KOREAN_REGEX) ?? []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars / 1.5 + otherChars / 4);
}

export function extractKeywords(text: string, topN = 5): string[] {
  const tokens = tokenize(text);
  const counts = new Map<string, { count: number; firstIdx: number }>();
  tokens.forEach((tok, idx) => {
    const existing = counts.get(tok);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(tok, { count: 1, firstIdx: idx });
    }
  });
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return a[1].firstIdx - b[1].firstIdx;
  });
  return sorted.slice(0, topN).map(([tok]) => tok);
}
