import "server-only";

import { loadPortfolio } from "./portfolio-data";
import type { PortfolioChunk } from "@/types/portfolio";

export type ProjectCategory = "자체프로젝트" | "업무" | "외부활동";

export interface ProjectSummary {
  id: string;
  title: string;
  company?: string;
  period?: { start: string; end?: string; ongoing?: boolean };
  role?: string;
  techKeywords: string[];
  impact: string;
  category: ProjectCategory;
  notionUrl?: string;
}

export interface CompanyGroup {
  company: string;
  period: string;
  projects: ProjectSummary[];
}

export interface SkillsData {
  frontend: string[];
  smartContract: string[];
}

export interface ExperienceData {
  groups: CompanyGroup[];
  others: ProjectSummary[];
  skills: SkillsData;
}

const FRONTEND_HEADING = /front[- ]?end|프론트/i;
const SMART_CONTRACT_HEADING = /smart[- ]?contract|스마트\s*컨트랙트|블록체인|web3|solidity/i;

export function loadExperienceData(): ExperienceData {
  let data;
  try {
    data = loadPortfolio();
  } catch {
    return { groups: [], others: [], skills: { frontend: [], smartContract: [] } };
  }

  const projectChunks = data.chunks.filter((c) => c.category === "project");
  const summaries = aggregateProjects(projectChunks);

  const groupedMap = new Map<string, ProjectSummary[]>();
  const others: ProjectSummary[] = [];

  for (const summary of summaries) {
    if (summary.company) {
      const existing = groupedMap.get(summary.company);
      if (existing) {
        existing.push(summary);
      } else {
        groupedMap.set(summary.company, [summary]);
      }
    } else {
      others.push(summary);
    }
  }

  const groups: CompanyGroup[] = [];
  for (const [company, projects] of groupedMap) {
    groups.push({
      company,
      period: groupPeriod(projects),
      projects,
    });
  }
  groups.sort((a, b) => latestStart(b) - latestStart(a));

  const skills = extractSkills(data.chunks);

  return { groups, others, skills };
}

function aggregateProjects(chunks: PortfolioChunk[]): ProjectSummary[] {
  const byPage = new Map<string, PortfolioChunk[]>();
  const order: string[] = [];
  for (const chunk of chunks) {
    const list = byPage.get(chunk.sourcePageId);
    if (list) {
      list.push(chunk);
    } else {
      byPage.set(chunk.sourcePageId, [chunk]);
      order.push(chunk.sourcePageId);
    }
  }

  return order.map((pageId) => {
    const pageChunks = byPage.get(pageId)!;
    const first = pageChunks[0]!;
    const meta = first.projectMeta ?? {};
    const tech = uniq(pageChunks.flatMap((c) => c.tags ?? []));
    const impact = firstNonEmptyLine(first.text) || first.sourceTitle;
    return {
      id: pageId,
      title: first.sourceTitle,
      company: meta.company,
      period: meta.period,
      role: meta.role,
      techKeywords: tech,
      impact,
      category: meta.notionCategory ?? "자체프로젝트",
      notionUrl:
        first.sourceUrl && first.sourceUrl.startsWith("http") ? first.sourceUrl : undefined,
    };
  });
}

function uniq(arr: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    return trimmed.replace(/^[-*>]\s*/, "");
  }
  return "";
}

function groupPeriod(projects: ProjectSummary[]): string {
  const periods = projects.map((p) => p.period).filter(Boolean) as Array<
    NonNullable<ProjectSummary["period"]>
  >;
  if (periods.length === 0) return "";
  const earliestStart = periods.reduce((acc, p) => (p.start < acc.start ? p : acc));
  const ongoing = periods.some((p) => p.ongoing);
  if (ongoing) return `${earliestStart.start} — 현재`;
  const latestEnd = periods.reduce((acc, p) => {
    const aEnd = acc.end ?? acc.start;
    const pEnd = p.end ?? p.start;
    return pEnd > aEnd ? p : acc;
  });
  const end = latestEnd.end ?? latestEnd.start;
  return `${earliestStart.start} — ${end}`;
}

function latestStart(group: CompanyGroup): number {
  let max = 0;
  for (const p of group.projects) {
    if (p.period?.start) {
      const numeric = Number(p.period.start.replace(/\D/g, "").slice(0, 6));
      if (numeric > max) max = numeric;
    }
  }
  return max;
}

function extractSkills(chunks: PortfolioChunk[]): SkillsData {
  const frontend = new Set<string>();
  const smartContract = new Set<string>();

  for (const chunk of chunks) {
    if (chunk.category !== "skill") continue;
    const headingText = chunk.headingPath.join(" ");
    const tokens = parseSkillTokens(chunk.text);
    if (FRONTEND_HEADING.test(headingText)) {
      tokens.forEach((t) => frontend.add(t));
    } else if (SMART_CONTRACT_HEADING.test(headingText)) {
      tokens.forEach((t) => smartContract.add(t));
    } else {
      tokens.forEach((t) => frontend.add(t));
    }
  }

  return {
    frontend: Array.from(frontend),
    smartContract: Array.from(smartContract),
  };
}

function parseSkillTokens(text: string): string[] {
  const cleaned = text
    .replace(/[`*#>]/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
  return cleaned
    .split(/[·,/\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40);
}
