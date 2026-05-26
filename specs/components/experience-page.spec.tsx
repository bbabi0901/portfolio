import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { ExperienceData, ProjectSummary } from "@/lib/experience-data";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: mockPush }),
  usePathname: () => "/experience",
}));

import { CategoryFilter } from "@/components/experience/CategoryFilter";
import { ProjectCard } from "@/components/experience/ProjectCard";
import { ExperienceClient } from "@/components/experience/ExperienceClient";
import { SkillsGrid } from "@/components/experience/SkillsGrid";
import { Timeline } from "@/components/experience/Timeline";

beforeEach(() => {
  mockPush.mockClear();
  mockSearchParams = new URLSearchParams();
});

function project(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "p-mfe",
    title: "MFE TF",
    company: "디라티오",
    role: "Senior Frontend Engineer",
    period: { start: "2025.01", ongoing: true },
    techKeywords: ["MFE", "Module Federation"],
    impact: "마이그레이션 주도",
    category: "업무",
    notionUrl: "https://www.notion.so/p-mfe",
    ...over,
  };
}

function makeData(over: Partial<ExperienceData> = {}): ExperienceData {
  return {
    groups: [
      {
        company: "디라티오",
        period: "2025.01 — 현재",
        projects: [project()],
      },
    ],
    others: [],
    skills: { frontend: ["TypeScript"], smartContract: ["Solidity"] },
    ...over,
  };
}

describe("CategoryFilter", () => {
  it("active=전체 시 button 강조", () => {
    render(<CategoryFilter options={["자체프로젝트", "업무", "외부활동"]} />);
    const all = screen.getByRole("button", { name: /전체/ });
    expect(all).toHaveAttribute("data-active", "true");
  });

  it("category=업무 클릭 → URL ?category=업무", () => {
    render(<CategoryFilter options={["자체프로젝트", "업무", "외부활동"]} />);
    const btn = screen.getByRole("button", { name: /^업무$/ });
    fireEvent.click(btn);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(String(mockPush.mock.calls[0]?.[0])).toContain("category=%EC%97%85%EB%AC%B4");
  });

  it("URL 에 category 가 있으면 해당 button 강조", () => {
    mockSearchParams = new URLSearchParams("category=업무");
    render(<CategoryFilter options={["자체프로젝트", "업무", "외부활동"]} />);
    const btn = screen.getByRole("button", { name: /^업무$/ });
    expect(btn).toHaveAttribute("data-active", "true");
    const all = screen.getByRole("button", { name: /전체/ });
    expect(all).toHaveAttribute("data-active", "false");
  });
});

describe("ProjectCard", () => {
  it("notionUrl null → '노션에서 자세히' disabled", () => {
    render(<ProjectCard project={project({ notionUrl: undefined })} />);
    const link = screen.queryByRole("link", { name: /노션에서 자세히/ });
    expect(link).toBeNull();
    const disabled = screen.getByRole("button", { name: /노션에서 자세히/ });
    expect(disabled).toBeDisabled();
  });

  it("tech chips 렌더", () => {
    render(<ProjectCard project={project({ techKeywords: ["Next.js", "TypeScript"] })} />);
    expect(screen.getByText("Next.js")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("외부 노션 링크는 target=_blank rel=noopener noreferrer", () => {
    render(<ProjectCard project={project()} />);
    const link = screen.getByRole("link", { name: /노션에서 자세히/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    expect(link.getAttribute("rel")).toMatch(/noreferrer/);
  });
});

describe("ExperienceClient", () => {
  it("카테고리 필터 결과 0 → 빈 상태", () => {
    mockSearchParams = new URLSearchParams("category=외부활동");
    render(<ExperienceClient data={makeData()} />);
    expect(screen.getByText(/이 카테고리에 해당하는 프로젝트가 없어요/)).toBeInTheDocument();
  });

  it("category 미지정 → 모든 그룹 렌더", () => {
    mockSearchParams = new URLSearchParams();
    render(
      <ExperienceClient
        data={makeData({
          groups: [
            {
              company: "디라티오",
              period: "2025.01 — 현재",
              projects: [project()],
            },
          ],
          others: [
            project({
              id: "p-weju",
              title: "weju",
              company: undefined,
              category: "자체프로젝트",
              notionUrl: undefined,
            }),
          ],
        })}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "디라티오" })).toBeInTheDocument();
    expect(screen.getByText("weju")).toBeInTheDocument();
  });

  it("category=자체프로젝트 → others 만 렌더", () => {
    mockSearchParams = new URLSearchParams("category=자체프로젝트");
    render(
      <ExperienceClient
        data={makeData({
          groups: [
            {
              company: "디라티오",
              period: "2025.01 — 현재",
              projects: [project()],
            },
          ],
          others: [
            project({
              id: "p-weju",
              title: "weju",
              company: undefined,
              category: "자체프로젝트",
              notionUrl: undefined,
            }),
          ],
        })}
      />,
    );
    expect(screen.queryByRole("heading", { level: 2, name: "디라티오" })).toBeNull();
    expect(screen.getByText("weju")).toBeInTheDocument();
  });
});

describe("SkillsGrid", () => {
  it("frontend / smartContract 두 컬럼", () => {
    render(
      <SkillsGrid
        skills={{
          frontend: ["TypeScript", "React"],
          smartContract: ["Solidity"],
        }}
      />,
    );
    expect(screen.getByText(/Frontend/)).toBeInTheDocument();
    expect(screen.getByText(/Smart Contract/)).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Solidity")).toBeInTheDocument();
  });
});

describe("Timeline", () => {
  it("회사 dot 클릭 → onSelectCompany", () => {
    const onSelect = vi.fn();
    render(
      <Timeline
        groups={[
          {
            company: "디라티오",
            period: "2025.01 — 현재",
            projects: [project()],
          },
        ]}
        onSelectCompany={onSelect}
      />,
    );
    const btn = screen.getByRole("button", { name: /디라티오/ });
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith("디라티오");
  });
});
