"use client";

import type { CompanyGroup as Group } from "@/lib/experience-data";
import { ProjectCard } from "./ProjectCard";
import { cn } from "@/lib/utils";

export interface CompanyGroupProps {
  group: Group;
  className?: string;
}

export function CompanyGroup({ group, className }: CompanyGroupProps) {
  return (
    <section
      id={`company-${slugify(group.company)}`}
      className={cn("flex flex-col gap-4", className)}
      aria-label={group.company}
    >
      <header className="flex flex-col gap-1 border-b border-neutral-900 pb-2">
        <h2 className="text-lg font-medium text-white">{group.company}</h2>
        {group.period ? (
          <p className="text-xs text-neutral-500">{group.period}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-3">
        {group.projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣\-]/g, "");
}
