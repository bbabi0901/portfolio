"use client";

import { ExternalLink } from "lucide-react";
import type { ProjectSummary } from "@/lib/experience-data";
import { cn } from "@/lib/utils";

export interface ProjectCardProps {
  project: ProjectSummary;
  className?: string;
}

function formatPeriod(period: ProjectSummary["period"]): string | null {
  if (!period) return null;
  if (period.ongoing) return `${period.start} — 현재`;
  if (period.end) return `${period.start} — ${period.end}`;
  return period.start;
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  const periodText = formatPeriod(project.period);
  const hasUrl = Boolean(project.notionUrl);

  return (
    <article
      className={cn("border-line bg-surface flex flex-col gap-3 rounded-lg border p-5", className)}
      data-category={project.category}
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-foreground text-base font-medium">{project.title}</h3>
        <div className="text-subtle flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
          {periodText ? <span>{periodText}</span> : null}
          {project.role ? <span>· {project.role}</span> : null}
        </div>
      </header>

      {project.impact ? <p className="text-body text-sm">{project.impact}</p> : null}

      {project.techKeywords.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {project.techKeywords.map((tech) => (
            <li
              key={tech}
              className="border-line text-muted rounded-md border px-2 py-0.5 text-[11px]"
            >
              {tech}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex justify-end">
        {hasUrl ? (
          <a
            href={project.notionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-line text-muted hover:border-line-strong hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
          >
            노션에서 자세히
            <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="노션 페이지가 비공개입니다"
            className="border-line text-faint inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs opacity-60"
          >
            노션에서 자세히
            <ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
