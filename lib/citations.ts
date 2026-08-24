import type { Citation } from "@/types/chat";
import type { PortfolioChunk } from "@/types/portfolio";

/**
 * 답변 출처 칩 (FEAT-041, TS-100) — 검색에 걸린 노션 문서를 X-Sources 헤더로
 * 서버→클라이언트 전달한다. HTTP 헤더는 ASCII 만 안전하므로 encodeURIComponent 로 감싼다.
 * 기록 워크스페이스가 공개 열람이라 칩은 청크의 노션 원본 URL 로 바로 연결한다.
 * URL 이 비었거나 https 가 아니면 sourceUrl null = "비공개" 칩.
 */

const MAX_SOURCES = 4;

// [제목, 노션 URL|null] 튜플 배열로 인코딩
type SourceEntry = [string, string | null];

export function buildSourcesHeader(chunks: PortfolioChunk[]): string {
  const entries: SourceEntry[] = [];
  for (const c of chunks) {
    if (!entries.some(([t]) => t === c.sourceTitle)) {
      entries.push([c.sourceTitle, c.sourceUrl || null]);
    }
    if (entries.length >= MAX_SOURCES) break;
  }
  if (entries.length === 0) return "";
  return encodeURIComponent(JSON.stringify(entries));
}

export function parseSourcesHeader(value: string | null): Citation[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is SourceEntry => Array.isArray(e) && typeof e[0] === "string" && e[0].length > 0,
      )
      .map(([sourceTitle, url]) => ({
        sourceTitle,
        // https 만 허용 — javascript: 등 스킴 오염 차단
        sourceUrl: typeof url === "string" && url.startsWith("https://") ? url : null,
      }));
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
