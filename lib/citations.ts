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

// fetch 응답(헤더 수신) 시점과 useChat onFinish(메시지 id 확정) 시점 사이의 전달 홀더.
// React 컴포넌트 밖 모듈 상태 — React Compiler 훅 규칙(렌더 중 ref/전역 접근 금지) 비대상.
// 채팅 인스턴스는 페이지당 1개, 요청은 순차(스트리밍 중 입력 비활성)라 경합 없음.
let lastSources: Citation[] | null = null;

export function stashSources(sources: Citation[]): void {
  lastSources = sources.length > 0 ? sources : null;
}

export function takeSources(): Citation[] | null {
  const v = lastSources;
  lastSources = null;
  return v;
}
