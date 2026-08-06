const WORD_REGEX = /[a-zA-Z0-9]+|[\uac00-\ud7af]+/g;
const KOREAN_REGEX = /[\uac00-\ud7af]/g;

function isKorean(token: string): boolean {
  return /^[\uac00-\ud7af]+$/.test(token);
}

// \ud55c\uad6d\uc5b4 \uc870\uc0ac \uc811\ubbf8 (EC-53, TS-96) \u2014 \ud615\ud0dc\uc18c \ubd84\uc11d \uc5c6\uc774 \ud754\ud55c \uc870\uc0ac\ub9cc \uc81c\uac70.
// "\ucde8\ubbf8\ub294"(\uc9c8\uc758) vs "\ucde8\ubbf8\uac00"(\ubcf8\ubb38) \ub958 \ubd88\uc77c\uce58\uac00 \ucf58\ud150\uce20 \uc874\uc7ac\uc5d0\ub3c4 NO_RECORD \ub97c \ub9cc\ub4e4\ub358 \uc2e4\uc0ac\ub840.
// \uae34 \uc870\uc0ac \uc6b0\uc120 \ub9e4\uce6d. \uc5b4\uac04\uc774 2\uc790 \ubbf8\ub9cc\uc774 \ub418\ub294 \uc81c\uac70\ub294 \uae08\uc9c0 (\uc0ac\uacfc/\uacb0\uacfc/\ub098\uc774/\uc9c0\ub3c4 \uc624\uc81c\uac70 \ubc29\uc9c0).
// ponytail: \uc0ac\uc804 \uae30\ubc18 \ud615\ud0dc\uc18c \ubd84\uc11d \uc5c6\uc774 \uc811\ubbf8 \ubaa9\ub85d \ud734\ub9ac\uc2a4\ud2f1 \u2014 \uc624\ud0d0\uc774 \ubb38\uc81c\ub418\uba74 kiwi \ub4f1\uc73c\ub85c \uc2b9\uaca9
const KOREAN_PARTICLES = [
  "\uc5d0\uc11c\ub294",
  "\uc73c\ub85c\ub294",
  "\uc5d0\uc11c",
  "\uc5d0\uac8c",
  "\ud55c\ud14c",
  "\uc73c\ub85c",
  "\ubd80\ud130",
  "\uae4c\uc9c0",
  "\ucc98\ub7fc",
  "\ubcf4\ub2e4",
  "\ub9c8\ub2e4",
  "\uc870\ucc28",
  "\ub9c8\uc800",
  "\uc774\ub098",
  "\uc774\ub780",
  "\ub77c\ub294",
  "\uc740",
  "\ub294",
  "\uc774",
  "\uac00",
  "\uc744",
  "\ub97c",
  "\uacfc",
  "\uc640",
  "\ub3c4",
  "\uc758",
  "\uc5d0",
  "\ub85c",
  "\ub9cc",
].sort((a, b) => b.length - a.length);

function stripParticle(token: string): string {
  for (const p of KOREAN_PARTICLES) {
    if (token.length - p.length >= 2 && token.endsWith(p)) {
      return token.slice(0, token.length - p.length);
    }
  }
  return token;
}

export function tokenize(text: string): string[] {
  if (text.length === 0) return [];
  const matches = text.match(WORD_REGEX) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    const lower = raw.toLowerCase();
    if (isKorean(lower)) {
      if (lower.length >= 2) out.push(stripParticle(lower));
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
