"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { ExperienceData, ProjectCategory, ProjectSummary } from "@/lib/experience-data";
import { ProjectTimeline } from "./ProjectTimeline";
import { cn } from "@/lib/utils";

export interface ExperienceClientProps {
  data: ExperienceData;
  className?: string;
}

const VALID_CATEGORIES: ProjectCategory[] = ["자체프로젝트", "업무", "외부활동"];

function isProjectCategory(value: string | null): value is ProjectCategory {
  return value !== null && (VALID_CATEGORIES as string[]).includes(value);
}

/** ongoing 우선 → 시작일 최신순 → 제목. 기간 없는 항목은 뒤로. */
function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((a, b) => {
    const aOngoing = a.period?.ongoing ? 1 : 0;
    const bOngoing = b.period?.ongoing ? 1 : 0;
    if (aOngoing !== bOngoing) return bOngoing - aOngoing;
    const aStart = a.period?.start ?? "";
    const bStart = b.period?.start ?? "";
    if (aStart !== bStart) return bStart.localeCompare(aStart);
    return a.title.localeCompare(b.title);
  });
}

export function ExperienceClient({ data, className }: ExperienceClientProps) {
  const searchParams = useSearchParams();
  const param = searchParams.get("category");
  const category = isProjectCategory(param) ? param : null;

  const projects = useMemo(() => {
    const all = [...data.groups.flatMap((g) => g.projects), ...data.others];
    const filtered = category ? all.filter((p) => p.category === category) : all;
    return sortProjects(filtered);
  }, [data, category]);

  return (
    <div className={cn("flex flex-col", className)}>
      {projects.length === 0 ? (
        <p className="text-muted text-sm">
          이 카테고리에 해당하는 프로젝트가 없어요. 다른 카테고리를 선택해 보세요.
        </p>
      ) : (
        <ProjectTimeline projects={projects} />
      )}
    </div>
  );
}
