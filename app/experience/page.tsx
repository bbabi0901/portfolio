import type { Metadata } from "next";
import { Suspense } from "react";

import { cn } from "@/lib/utils";
import { CareerTimelineSection } from "@/components/about/AboutSection";
import { CategoryFilter } from "@/components/experience/CategoryFilter";
import { ExperienceClient } from "@/components/experience/ExperienceClient";
import { SkillsGrid } from "@/components/experience/SkillsGrid";
import { loadExperienceData, type ProjectCategory } from "@/lib/experience-data";
import { loadProfileData } from "@/lib/profile-data";

export const metadata: Metadata = {
  title: "커리어",
  description: "김윤수의 커리어·프로젝트 타임라인 + 보유 스킬.",
  alternates: { canonical: "/experience" },
};

export const dynamic = "force-static";

const ALL_CATEGORIES: ProjectCategory[] = ["자체프로젝트", "업무", "외부활동"];

export default function ExperiencePage() {
  const data = loadExperienceData();
  // 이력서(career) 청크에서 재구성한 커리어 타임라인 (lib/profile-data.ts extractCareer)
  const careerSection = loadProfileData()?.career;

  const hasProjectData =
    data.groups.length > 0 ||
    data.others.length > 0 ||
    data.skills.frontend.length > 0 ||
    data.skills.smartContract.length > 0;

  if (!hasProjectData && !careerSection) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:max-w-4xl lg:px-8">
        <p className="text-muted">커리어가 준비 중입니다.</p>
      </main>
    );
  }

  const presentCategories = collectCategories(data);

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-12 md:px-6 lg:max-w-4xl lg:px-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
          커리어
        </h1>
      </header>
      {careerSection && (
        <section className="flex flex-col gap-5">
          <h2 className="text-foreground text-[15px] font-medium">커리어 타임라인</h2>
          <CareerTimelineSection subSections={careerSection.subSections} />
        </section>
      )}
      {hasProjectData && (
        <>
          <section
            className={cn("flex flex-col gap-6", careerSection && "border-line border-t pt-10")}
          >
            <h2 className="text-foreground text-[15px] font-medium">프로젝트</h2>
            <Suspense fallback={null}>
              <CategoryFilter options={presentCategories} />
            </Suspense>
            <Suspense fallback={null}>
              <ExperienceClient data={data} />
            </Suspense>
          </section>
          <SkillsGrid skills={data.skills} />
        </>
      )}
    </main>
  );
}

function collectCategories(data: ReturnType<typeof loadExperienceData>): ProjectCategory[] {
  const found = new Set<ProjectCategory>();
  for (const g of data.groups) {
    for (const p of g.projects) found.add(p.category);
  }
  for (const p of data.others) found.add(p.category);
  return ALL_CATEGORIES.filter((c) => found.has(c));
}
