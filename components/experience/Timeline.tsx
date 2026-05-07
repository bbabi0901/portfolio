"use client";

import type { CompanyGroup } from "@/lib/experience-data";
import { cn } from "@/lib/utils";

export interface TimelineProps {
  groups: CompanyGroup[];
  activeCompany?: string;
  onSelectCompany?: (company: string) => void;
  className?: string;
}

export function Timeline({
  groups,
  activeCompany,
  onSelectCompany,
  className,
}: TimelineProps) {
  if (groups.length === 0) return null;

  function handleClick(company: string) {
    onSelectCompany?.(company);
    if (typeof document !== "undefined") {
      const el = document.getElementById(`company-${slugify(company)}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <nav
      className={cn(
        "flex gap-3 overflow-x-auto pb-2 lg:sticky lg:top-20 lg:max-h-[100dvh] lg:flex-col lg:overflow-visible lg:pb-0",
        className,
      )}
      aria-label="회사 타임라인"
    >
      {groups.map((g) => {
        const active = activeCompany === g.company;
        return (
          <button
            key={g.company}
            type="button"
            onClick={() => handleClick(g.company)}
            data-active={active}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 lg:shrink",
              active
                ? "text-white"
                : "text-neutral-400 hover:text-neutral-200",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                active ? "bg-lime-300" : "bg-neutral-600",
              )}
            />
            <span className="flex flex-col">
              <span className="font-medium">{g.company}</span>
              {g.period ? (
                <span className="text-[11px] text-neutral-500">{g.period}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣\-]/g, "");
}
