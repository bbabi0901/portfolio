export interface FilterInput {
  text: string;
  allowedSourceUrls: string[];
}

export interface FilterResult {
  text: string;
  maskedUrlCount: number;
  promptLeakDetected: boolean;
}

export const PROMPT_LEAK_PATTERNS: readonly RegExp[] = Object.freeze([
  /당신은\s+.+?의\s+포트폴리오\s+비서/,
  /You are\s+.+?'s\s+portfolio\s+assistant/i,
  /=====\s*컨텍스트\s*=====/,
  /=====\s*context\s*=====/i,
  /이전\s*지시\s*무시/,
  /이전\s*규칙을?\s*잊/,
  /ignore\s+(?:all\s+|the\s+)?previous\s+instructions/i,
  /\bsystem\s+prompt\b/i,
  /\bsystem\s+role\b/i,
  /you\s+are\s+programmed\s+to/i,
]);

const PUBLIC_ALLOWLIST: readonly RegExp[] = Object.freeze([
  /^https:\/\/github\.com\/YoonsooKim9(\/|$)/,
  /^mailto:bbabi0901@gmail\.com$/,
]);

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const RAW_URL_RE = /https?:\/\/[^\s)\]]+|mailto:[^\s)\]]+/g;

function stripQueryAndFragment(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

export function isAllowedUrl(url: string, allowed: string[]): boolean {
  for (const pat of PUBLIC_ALLOWLIST) {
    if (pat.test(url)) return true;
  }
  const normalized = stripQueryAndFragment(url);
  for (const a of allowed) {
    if (stripQueryAndFragment(a) === normalized) return true;
  }
  return false;
}

export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const mdMatches: Array<[number, number]> = [];

  for (const m of text.matchAll(MARKDOWN_LINK_RE)) {
    const url = m[2];
    if (url) urls.push(url);
    if (m.index !== undefined) {
      mdMatches.push([m.index, m.index + m[0].length]);
    }
  }

  for (const m of text.matchAll(RAW_URL_RE)) {
    if (m.index === undefined) continue;
    const start = m.index;
    const insideMd = mdMatches.some(([s, e]) => start >= s && start < e);
    if (insideMd) continue;
    urls.push(m[0]);
  }

  return urls;
}

function maskLeakLines(text: string): { text: string; leak: boolean } {
  let leak = false;
  const masked = text
    .split("\n")
    .map((line) => {
      for (const pat of PROMPT_LEAK_PATTERNS) {
        if (pat.test(line)) {
          leak = true;
          return "[redacted]";
        }
      }
      return line;
    })
    .join("\n");
  return { text: masked, leak };
}

export function filterOutput(input: FilterInput): FilterResult {
  const { allowedSourceUrls } = input;
  let maskedUrlCount = 0;

  const { text: leakMasked, leak: promptLeakDetected } = maskLeakLines(
    input.text,
  );

  let working = leakMasked.replace(MARKDOWN_LINK_RE, (_match, label, url) => {
    if (isAllowedUrl(url, allowedSourceUrls)) {
      return `[${label}](${url})`;
    }
    maskedUrlCount += 1;
    return "[link removed]";
  });

  working = working.replace(RAW_URL_RE, (url) => {
    if (isAllowedUrl(url, allowedSourceUrls)) return url;
    maskedUrlCount += 1;
    return "[link removed]";
  });

  return { text: working, maskedUrlCount, promptLeakDetected };
}
