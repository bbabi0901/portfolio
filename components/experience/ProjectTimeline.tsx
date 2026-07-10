import type { JSX } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ProjectSummary } from "@/lib/experience-data";

/**
 * 프로젝트 타임라인 — 커리어 타임라인과 동일한 시각 문법 (좌: 기간/카테고리 · 점+선 · 우: 내용).
 * 진행 중(ongoing) 프로젝트는 brand 점으로 표시.
 */
export interface ProjectTimelineProps {
  projects: ProjectSummary[];
  className?: string;
}

function formatPeriod(period: ProjectSummary["period"]): string {
  if (!period?.start) return "";
  const fmt = (iso: string) => iso.slice(0, 7).replace("-", ".");
  if (period.ongoing) return `${fmt(period.start)} - 현재`;
  if (period.end) return `${fmt(period.start)} - ${fmt(period.end)}`;
  return fmt(period.start);
}

const MAX_TAGS = 5;

export function ProjectTimeline({ projects, className }: ProjectTimelineProps): JSX.Element {
  return (
    <div className={cn("flex flex-col", className)}>
      {projects.map((p, idx) => {
        const period = formatPeriod(p.period);
        const ongoing = !!p.period?.ongoing;
        return (
          <div key={p.id} className="flex">
            {/* Left column: 기간 / 카테고리 — hidden on mobile */}
            <div className="hidden w-[116px] shrink-0 pt-0.5 pr-5 pb-8 text-right sm:block">
              {period && (
                <p className="text-foreground text-[12px] leading-snug font-medium">{period}</p>
              )}
              <p className="text-subtle mt-0.5 text-[11px] leading-snug">{p.category}</p>
            </div>

            {/* Dot + line column */}
            <div className="hidden shrink-0 flex-col items-center sm:flex">
              <div
                className={cn(
                  "mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full",
                  ongoing ? "bg-brand" : "bg-faint",
                )}
              />
              {idx < projects.length - 1 && <div className="bg-line mt-1.5 w-px flex-1" />}
            </div>

            {/* Content column */}
            <div className="min-w-0 flex-1 pb-8 sm:pl-5">
              {/* Mobile header */}
              <div className="mb-1.5 flex items-start justify-between gap-3 sm:hidden">
                <p className="text-subtle text-[11px]">{p.category}</p>
                {period && <p className="text-faint shrink-0 text-[11px]">{period}</p>}
              </div>

              <div className="flex items-start justify-between gap-3">
                <p className="text-foreground text-[14px] leading-snug font-medium">{p.title}</p>
                {p.notionUrl && (
                  <a
                    href={p.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.title} — 노션에서 자세히`}
                    className="text-faint hover:text-body mt-0.5 shrink-0 transition-colors"
                  >
                    <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                )}
              </div>

              {p.impact && (
                <p className="text-subtle mt-1 text-[12px] leading-relaxed">{p.impact}</p>
              )}

              {p.techKeywords.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {p.techKeywords.slice(0, MAX_TAGS).map((t) => (
                    <li
                      key={t}
                      className="border-line text-subtle rounded border px-1.5 py-0.5 text-[10px]"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
