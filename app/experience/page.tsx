import type { Metadata } from "next";
import { Suspense } from "react";

import { CategoryFilter } from "@/components/experience/CategoryFilter";
import { ExperienceClient } from "@/components/experience/ExperienceClient";
import { SkillsGrid } from "@/components/experience/SkillsGrid";
import {
  loadExperienceData,
  type ProjectCategory,
} from "@/lib/experience-data";

export const metadata: Metadata = {
  title: "기술 이력",
  description: "김윤수의 회사·프로젝트 타임라인 + 보유 스킬.",
  alternates: { canonical: "/experience" },
};

export const dynamic = "force-static";

const ALL_CATEGORIES: ProjectCategory[] = ["자체프로젝트", "업무", "외부활동"];

export default function ExperiencePage() {
  const data = loadExperienceData();

  if (
    data.groups.length === 0 &&
    data.others.length === 0 &&
    data.skills.frontend.length === 0 &&
    data.skills.smartContract.length === 0
  ) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:max-w-4xl lg:px-8">
        <p className="text-neutral-400">기술 이력이 준비 중입니다.</p>
      </main>
    );
  }

  const presentCategories = collectCategories(data);

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-12 md:px-6 lg:max-w-4xl lg:px-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          기술 이력
        </h1>
        <Suspense fallback={null}>
          <CategoryFilter options={presentCategories} />
        </Suspense>
      </header>
      <Suspense fallback={null}>
        <ExperienceClient data={data} />
      </Suspense>
      <SkillsGrid skills={data.skills} />
    </main>
  );
}

function collectCategories(
  data: ReturnType<typeof loadExperienceData>,
): ProjectCategory[] {
  const found = new Set<ProjectCategory>();
  for (const g of data.groups) {
    for (const p of g.projects) found.add(p.category);
  }
  for (const p of data.others) found.add(p.category);
  return ALL_CATEGORIES.filter((c) => found.has(c));
}
