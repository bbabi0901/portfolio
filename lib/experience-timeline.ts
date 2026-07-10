import { parseCareerMarkdown, type CareerEntry } from "./career-markdown";
import type { ProjectSummary } from "./experience-data";

/**
 * 통합 커리어 타임라인 (/experience) — 회사 경력(career 마크다운)과 자체 프로젝트
 * (project 청크의 notionCategory === "자체프로젝트")를 시작일 내림차순 하나의
 * 타임라인으로 병합한다.
 */
export type TimelineItem =
  | { kind: "company"; entry: CareerEntry; startKey: string }
  | { kind: "personal"; project: ProjectSummary; startKey: string };

/** 정렬 키 "YYYY.MM" — 없으면 "0000.00" (마지막 배치) */
const NO_START = "0000.00";

function companyStartKey(period: string): string {
  const m = period.match(/(\d{4})\.(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : NO_START;
}

function personalStartKey(period: ProjectSummary["period"]): string {
  if (!period?.start) return NO_START;
  return period.start.slice(0, 7).replace("-", ".");
}

export function buildUnifiedTimeline(
  careerBody: string | undefined,
  personalProjects: ProjectSummary[],
): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (careerBody) {
    const { entries } = parseCareerMarkdown(careerBody);
    for (const entry of entries) {
      items.push({ kind: "company", entry, startKey: companyStartKey(entry.period) });
    }
  }

  for (const project of personalProjects) {
    items.push({ kind: "personal", project, startKey: personalStartKey(project.period) });
  }

  items.sort((a, b) => b.startKey.localeCompare(a.startKey));
  return items;
}
