import type { ChunkCategory, PortfolioChunk } from "@/types/portfolio";
import type { NotionPageContent } from "@/types/notion";
import { estimateTokens, extractKeywords } from "./tokenize";

export interface ChunkOptions {
  /** 청크 1개의 목표 토큰 수 (default 600) */
  targetTokens?: number;
  /** 청크 1개의 상한 토큰 수. 단일 heading이 이를 초과해도 분할하지 않음 (코드블록 보호) (default 1200) */
  maxTokens?: number;
  /** 페이지당 청크 상한 (default 30). 초과 시 후반 컷 + 경고 콜백 */
  maxChunksPerPage?: number;
  /** 너무 짧은 청크는 직전 청크에 머지 (default 150) */
  mergeBelowTokens?: number;
  /** 비결정적 hash 사용 회피 (deterministic id 생성) */
  idStrategy?: "stable-hash";
  /** 경고 핸들러 — 30 청크 초과, 코드블록 너무 김 등 */
  onWarn?: (message: string) => void;
}

const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_MAX_CHUNKS_PER_PAGE = 30;
const DEFAULT_MERGE_BELOW_TOKENS = 150;

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/;
const FENCE_REGEX = /^```/;
const FRONTMATTER_DELIM = "---";

interface RawSection {
  headingPath: string[];
  bodyLines: string[];
}

function stripFrontMatter(markdown: string): string {
  const lines = markdown.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_DELIM) return markdown;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FRONTMATTER_DELIM) {
      return lines.slice(i + 1).join("\n");
    }
  }
  return markdown;
}

function parseSections(markdown: string): RawSection[] {
  if (!markdown.trim()) return [];
  const stripped = stripFrontMatter(markdown);
  const lines = stripped.split("\n");
  const sections: RawSection[] = [];
  const stack: { level: number; text: string }[] = [];
  let current: RawSection | null = null;
  let inFence = false;

  for (const line of lines) {
    if (FENCE_REGEX.test(line)) {
      inFence = !inFence;
      if (!current) current = { headingPath: [], bodyLines: [] };
      current.bodyLines.push(line);
      continue;
    }
    if (inFence) {
      if (!current) current = { headingPath: [], bodyLines: [] };
      current.bodyLines.push(line);
      continue;
    }
    const match = line.match(HEADING_REGEX);
    if (match) {
      const hashes = match[1];
      const rawText = match[2];
      if (!hashes || !rawText) continue;
      if (current && current.bodyLines.some((l) => l.trim().length > 0)) {
        sections.push(current);
      }
      const level = hashes.length;
      const text = rawText.trim();
      while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= level) {
        stack.pop();
      }
      stack.push({ level, text });
      current = { headingPath: stack.map((s) => s.text), bodyLines: [] };
    } else {
      if (!current) current = { headingPath: [], bodyLines: [] };
      current.bodyLines.push(line);
    }
  }
  if (current && current.bodyLines.some((l) => l.trim().length > 0)) {
    sections.push(current);
  }
  return sections;
}

function buildText(bodyLines: string[]): string {
  let start = 0;
  let end = bodyLines.length;
  while (start < end && (bodyLines[start]?.trim() ?? "") === "") start++;
  while (end > start && (bodyLines[end - 1]?.trim() ?? "") === "") end--;
  return bodyLines.slice(start, end).join("\n");
}

interface BuiltChunk {
  headingPath: string[];
  text: string;
  tokens: number;
}

export function chunkMarkdown(
  page: NotionPageContent,
  category: ChunkCategory,
  options?: ChunkOptions,
): PortfolioChunk[] {
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxChunksPerPage = options?.maxChunksPerPage ?? DEFAULT_MAX_CHUNKS_PER_PAGE;
  const mergeBelowTokens = options?.mergeBelowTokens ?? DEFAULT_MERGE_BELOW_TOKENS;
  const onWarn = options?.onWarn;

  const sections = parseSections(page.markdown);
  if (sections.length === 0) return [];

  const built: BuiltChunk[] = sections.map((s) => {
    const text = buildText(s.bodyLines);
    return {
      headingPath: s.headingPath,
      text,
      tokens: estimateTokens(text),
    };
  });

  const merged: BuiltChunk[] = [];
  for (const b of built) {
    const prev = merged[merged.length - 1];
    if (prev && b.tokens < mergeBelowTokens && prev.tokens >= mergeBelowTokens) {
      prev.text = `${prev.text}\n\n${b.text}`;
      prev.tokens = estimateTokens(prev.text);
    } else {
      merged.push({ headingPath: [...b.headingPath], text: b.text, tokens: b.tokens });
    }
  }

  let final = merged;
  if (merged.length > maxChunksPerPage) {
    onWarn?.(
      `[chunking] page ${page.ref.id} produced ${merged.length} chunks, trimmed to ${maxChunksPerPage}`,
    );
    final = merged.slice(0, maxChunksPerPage);
  }

  for (const b of final) {
    if (b.tokens > maxTokens) {
      onWarn?.(
        `[chunking] page ${page.ref.id} chunk "${b.headingPath.join("→")}" exceeds maxTokens (${b.tokens} > ${maxTokens}); kept as single chunk to preserve code block boundaries`,
      );
    }
  }

  return final.map((b, idx) => {
    const seed = `${page.ref.id}::${b.headingPath.join("→") || `idx-${idx}`}::${idx}`;
    const id = stableHash(seed);
    const tags = extractKeywords(b.text, 5);
    return {
      id,
      sourcePageId: page.ref.id,
      sourceTitle: page.ref.title,
      sourceUrl: page.ref.url,
      category,
      headingPath: b.headingPath,
      text: b.text,
      tokens: b.tokens,
      embedding: [],
      tags,
    };
  });
}

export function chunkPages(
  pages: NotionPageContent[],
  categoryResolver: (page: NotionPageContent) => ChunkCategory,
  options?: ChunkOptions,
): PortfolioChunk[] {
  const out: PortfolioChunk[] = [];
  for (const p of pages) {
    out.push(...chunkMarkdown(p, categoryResolver(p), options));
  }
  return out;
}

export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
