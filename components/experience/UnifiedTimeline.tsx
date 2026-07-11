import type { JSX } from "react";

import { cn } from "@/lib/utils";
import type { TimelineItem } from "@/lib/experience-timeline";
import type { CareerEntry } from "@/lib/career-markdown";

/**
 * 통합 커리어 타임라인 — 이력서(career 마크다운) 단일 소스의 회사 경력·자체 프로젝트를
 * 하나의 타임라인으로 렌더. 좌: 회사명(또는 "자체 프로젝트")/직함 + 기간 ·
 * 점(진행 중 = brand)+선 · 우: 프로젝트 그룹.
 */
export interface UnifiedTimelineProps {
  items: TimelineItem[];
  className?: string;
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

function EntryContent({ entry }: { entry: CareerEntry }) {
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

export function UnifiedTimeline({ items, className }: UnifiedTimelineProps): JSX.Element {
  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((item, idx) => {
        const { entry } = item;
        const isLast = idx === items.length - 1;
        return (
          <div key={`${entry.company}-${idx}`} className="flex">
            <LeftColumn
              title={entry.company}
              subtitle={entry.role || undefined}
              period={entry.period}
            />
            <DotColumn active={entry.isActive} isLast={isLast} />
            <div className="min-w-0 flex-1 pb-8 sm:pl-5">
              <MobileHeader
                title={entry.company}
                subtitle={entry.role || undefined}
                period={entry.period}
              />
              <EntryContent entry={entry} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
