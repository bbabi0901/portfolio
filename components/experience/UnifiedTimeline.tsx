import type { JSX } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TimelineItem } from "@/lib/experience-timeline";
import type { ProjectSummary } from "@/lib/experience-data";
import type { CareerEntry } from "@/lib/career-markdown";

/**
 * 통합 커리어 타임라인 — 회사 경력과 자체 프로젝트를 하나의 타임라인으로 렌더.
 * 좌: 회사명/직함(또는 "자체 프로젝트") + 기간 · 점(진행 중 = brand)+선 · 우: 내용.
 */
export interface UnifiedTimelineProps {
  items: TimelineItem[];
  className?: string;
}

const MAX_TAGS = 5;

function formatPersonalPeriod(period: ProjectSummary["period"]): string {
  if (!period?.start) return "";
  const fmt = (iso: string) => iso.slice(0, 7).replace("-", ".");
  if (period.ongoing) return `${fmt(period.start)} - 현재`;
  if (period.end) return `${fmt(period.start)} - ${fmt(period.end)}`;
  return fmt(period.start);
}

function LeftColumn({
  title,
  subtitle,
  period,
}: {
  title: string;
  subtitle?: string;
  period: string;
}) {
  return (
    <div className="hidden w-[116px] shrink-0 pt-0.5 pr-5 pb-8 text-right sm:block">
      <p className="text-foreground text-[12px] leading-snug font-medium">{title}</p>
      {subtitle && <p className="text-subtle mt-0.5 text-[11px] leading-snug">{subtitle}</p>}
      {period && <p className="text-faint mt-2 text-[11px]">{period}</p>}
    </div>
  );
}

function DotColumn({ active, isLast }: { active: boolean; isLast: boolean }) {
  return (
    <div className="hidden shrink-0 flex-col items-center sm:flex">
      <div
        className={cn(
          "mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full",
          active ? "bg-brand" : "bg-faint",
        )}
      />
      {!isLast && <div className="bg-line mt-1.5 w-px flex-1" />}
    </div>
  );
}

function MobileHeader({
  title,
  subtitle,
  period,
}: {
  title: string;
  subtitle?: string;
  period: string;
}) {
  return (
    <div className="mb-3 sm:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-foreground text-[13px] leading-snug font-medium">{title}</p>
          {subtitle && <p className="text-subtle mt-0.5 text-[11px]">{subtitle}</p>}
        </div>
        {period && <p className="text-faint mt-0.5 shrink-0 text-[11px]">{period}</p>}
      </div>
    </div>
  );
}

function CompanyContent({ entry }: { entry: CareerEntry }) {
  return (
    <div className="flex flex-col gap-4">
      {entry.bulletGroups.map((group, gIdx) => (
        <div key={gIdx} className="flex flex-col gap-1">
          {group[0] && <p className="text-body text-[12px] leading-snug font-medium">{group[0]}</p>}
          {group.length > 1 && (
            <ul className="border-line/60 m-0 ml-2 list-none space-y-1 border-l pl-3">
              {group.slice(1).map((bullet, bIdx) => (
                <li key={bIdx} className="text-subtle text-[11px] leading-relaxed">
                  {bullet}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function PersonalContent({ project }: { project: ProjectSummary }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground text-[14px] leading-snug font-medium">{project.title}</p>
        {project.notionUrl && (
          <a
            href={project.notionUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${project.title} — 노션에서 자세히`}
            className="text-faint hover:text-body mt-0.5 shrink-0 transition-colors"
          >
            <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden="true" />
          </a>
        )}
      </div>
      {project.impact && (
        <p className="text-subtle mt-1 text-[12px] leading-relaxed">{project.impact}</p>
      )}
      {project.techKeywords.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {project.techKeywords.slice(0, MAX_TAGS).map((t) => (
            <li
              key={t}
              className="border-line text-subtle rounded border px-1.5 py-0.5 text-[10px]"
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function UnifiedTimeline({ items, className }: UnifiedTimelineProps): JSX.Element {
  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        if (item.kind === "company") {
          const { entry } = item;
          return (
            <div key={`company-${entry.company}-${idx}`} className="flex">
              <LeftColumn title={entry.company} subtitle={entry.role} period={entry.period} />
              <DotColumn active={entry.isActive} isLast={isLast} />
              <div className="min-w-0 flex-1 pb-8 sm:pl-5">
                <MobileHeader title={entry.company} subtitle={entry.role} period={entry.period} />
                <CompanyContent entry={entry} />
              </div>
            </div>
          );
        }
        const { project } = item;
        const period = formatPersonalPeriod(project.period);
        return (
          <div key={`personal-${project.id}`} className="flex">
            <LeftColumn title="자체 프로젝트" period={period} />
            <DotColumn active={!!project.period?.ongoing} isLast={isLast} />
            <div className="min-w-0 flex-1 pb-8 sm:pl-5">
              <MobileHeader title="자체 프로젝트" period={period} />
              <PersonalContent project={project} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
