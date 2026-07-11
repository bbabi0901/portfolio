import { parseCareerMarkdown, type CareerEntry } from "./career-markdown";

/**
 * 통합 커리어 타임라인 (/experience) — 이력서(career 마크다운) 단일 소스.
 * 회사 경력과 자체 프로젝트가 같은 blockquote 포맷(`> | 회사`, `> 기간`)으로
 * 이력서에 기록되며, 시작일 내림차순으로 정렬해 하나의 타임라인으로 렌더한다.
 */
export interface TimelineItem {
  entry: CareerEntry;
  startKey: string;
}

/** 정렬 키 "YYYY.MM" — 없으면 "0000.00" (마지막 배치) */
const NO_START = "0000.00";

function startKeyOf(period: string): string {
  const m = period.match(/(\d{4})\.(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : NO_START;
}

export function buildUnifiedTimeline(careerBody: string | undefined): TimelineItem[] {
  if (!careerBody) return [];

  const { entries } = parseCareerMarkdown(careerBody);
  const items = entries.map((entry) => ({ entry, startKey: startKeyOf(entry.period) }));
  items.sort((a, b) => b.startKey.localeCompare(a.startKey));
  return items;
}
