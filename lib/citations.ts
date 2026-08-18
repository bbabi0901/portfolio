import type { Citation } from "@/types/chat";
import type { PortfolioChunk } from "@/types/portfolio";

/**
 * 답변 출처 칩 (FEAT-041, TS-100) — 검색에 걸린 노션 문서 제목을 X-Sources 헤더로
 * 서버→클라이언트 전달한다. HTTP 헤더는 ASCII 만 안전하므로 encodeURIComponent 로 감싼다.
 * 노션 페이지는 비공개라 sourceUrl 은 null — SourceCitation 이 "비공개" 칩으로 렌더.
 */

const MAX_SOURCES = 4;

export function buildSourcesHeader(chunks: PortfolioChunk[]): string {
  const titles: string[] = [];
  for (const c of chunks) {
    if (!titles.includes(c.sourceTitle)) titles.push(c.sourceTitle);
    if (titles.length >= MAX_SOURCES) break;
  }
  if (titles.length === 0) return "";
  return encodeURIComponent(JSON.stringify(titles));
}

export function parseSourcesHeader(value: string | null): Citation[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .map((sourceTitle) => ({ sourceTitle, sourceUrl: null }));
  } catch {
    return [];
  }
}
