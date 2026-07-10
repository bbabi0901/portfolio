import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { CredentialList } from "@/components/experience/CredentialList";
import { SkillsGrid } from "@/components/experience/SkillsGrid";
import { UnifiedTimeline } from "@/components/experience/UnifiedTimeline";
import type { TimelineItem } from "@/lib/experience-timeline";
import type { ProjectSummary } from "@/lib/experience-data";

function personal(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "p-ai",
    title: "AI 포트폴리오",
    techKeywords: ["rag", "next.js"],
    impact: "노션 기록 기반 대화형 포트폴리오",
    category: "자체프로젝트",
    period: { start: "2026-05-01", ongoing: true },
    notionUrl: "https://www.notion.so/p-ai",
    ...over,
  };
}

const COMPANY_ITEM: TimelineItem = {
  kind: "company",
  startKey: "2025.01",
  entry: {
    company: "디라티오",
    role: "소프트웨어 엔지니어",
    period: "2025.01 - 현재",
    isActive: true,
    bulletGroups: [["MFE TF", "전환 주도", "Module Federation 도입"]],
  },
};

describe("UnifiedTimeline (통합 커리어 타임라인, TS-83)", () => {
  it("회사 항목: 회사명·직함·기간·프로젝트 그룹 렌더", () => {
    render(<UnifiedTimeline items={[COMPANY_ITEM]} />);
    expect(screen.getAllByText("디라티오").length).toBeGreaterThan(0);
    expect(screen.getAllByText("소프트웨어 엔지니어").length).toBeGreaterThan(0);
    expect(screen.getByText("MFE TF")).toBeInTheDocument();
    expect(screen.getByText("전환 주도")).toBeInTheDocument();
  });

  it("자체 프로젝트 항목: '자체 프로젝트' 라벨·기간·제목·설명·태그·노션 링크", () => {
    const items: TimelineItem[] = [{ kind: "personal", startKey: "2026.05", project: personal() }];
    render(<UnifiedTimeline items={items} />);
    expect(screen.getAllByText("자체 프로젝트").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026.05 - 현재").length).toBeGreaterThan(0);
    expect(screen.getByText("AI 포트폴리오")).toBeInTheDocument();
    expect(screen.getByText("노션 기록 기반 대화형 포트폴리오")).toBeInTheDocument();
    expect(screen.getByText("rag")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /노션에서 자세히/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
  });

  it("회사 + 자체 프로젝트 혼합 순서 그대로 렌더", () => {
    const items: TimelineItem[] = [
      { kind: "personal", startKey: "2026.05", project: personal() },
      COMPANY_ITEM,
    ];
    const { container } = render(<UnifiedTimeline items={items} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("AI 포트폴리오")).toBeLessThan(text.indexOf("디라티오"));
  });
});

describe("CredentialList (학력·자격증 행 리스트, TS-84)", () => {
  it("제목·부제·기간 렌더", () => {
    render(
      <CredentialList
        items={[
          { title: "고려대학교 신소재공학부", subtitle: "학사", period: "2012.02 - 2018.03" },
          { title: "AWS Certified AI Practitioner", subtitle: "Amazon Web Services" },
        ]}
      />,
    );
    expect(screen.getByText("고려대학교 신소재공학부")).toBeInTheDocument();
    expect(screen.getByText("2012.02 - 2018.03")).toBeInTheDocument();
    expect(screen.getByText("AWS Certified AI Practitioner")).toBeInTheDocument();
    expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
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
