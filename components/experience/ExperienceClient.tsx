"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  CompanyGroup as Group,
  ExperienceData,
  ProjectCategory,
  ProjectSummary,
} from "@/lib/experience-data";
import { CompanyGroup } from "./CompanyGroup";
import { ProjectCard } from "./ProjectCard";
import { Timeline } from "./Timeline";
import { cn } from "@/lib/utils";

export interface ExperienceClientProps {
  data: ExperienceData;
  className?: string;
}

const VALID_CATEGORIES: ProjectCategory[] = ["자체프로젝트", "업무", "외부활동"];

function isProjectCategory(value: string | null): value is ProjectCategory {
  return value !== null && (VALID_CATEGORIES as string[]).includes(value);
}

function filterByCategory(
  data: ExperienceData,
  category: ProjectCategory | null,
): { groups: Group[]; others: ProjectSummary[] } {
  if (!category) return { groups: data.groups, others: data.others };
  const groups = data.groups
    .map((g) => ({
      ...g,
      projects: g.projects.filter((p) => p.category === category),
    }))
    .filter((g) => g.projects.length > 0);
  const others = data.others.filter((p) => p.category === category);
  return { groups, others };
}

export function ExperienceClient({ data, className }: ExperienceClientProps) {
  const searchParams = useSearchParams();
  const param = searchParams.get("category");
  const category = isProjectCategory(param) ? param : null;
  const [activeCompany, setActiveCompany] = useState<string | undefined>(undefined);

  const filtered = useMemo(() => filterByCategory(data, category), [data, category]);

  const isEmpty = filtered.groups.length === 0 && filtered.others.length === 0;

  return (
    <div className={cn("flex flex-col gap-8 lg:flex-row lg:gap-10", className)}>
      <aside className="lg:w-48 lg:shrink-0">
        <Timeline
          groups={filtered.groups}
          activeCompany={activeCompany}
          onSelectCompany={setActiveCompany}
        />
      </aside>
      <div className="flex-1 space-y-8">
        {isEmpty ? (
          <p className="text-muted text-sm">
            이 카테고리에 해당하는 프로젝트가 없어요. 다른 카테고리를 선택해 보세요.
          </p>
        ) : (
          <>
            {filtered.groups.map((g) => (
              <CompanyGroup key={g.company} group={g} />
            ))}
            {filtered.others.length > 0 ? (
              <section className="flex flex-col gap-4" aria-label="자체 프로젝트">
                <h2 className="text-foreground text-lg font-medium">자체 프로젝트</h2>
                <div className="flex flex-col gap-3">
                  {filtered.others.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
