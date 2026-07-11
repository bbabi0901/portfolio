import type { Metadata } from "next";

import { CredentialList } from "@/components/experience/CredentialList";
import { SkillsGrid } from "@/components/experience/SkillsGrid";
import { UnifiedTimeline } from "@/components/experience/UnifiedTimeline";
import { buildUnifiedTimeline } from "@/lib/experience-timeline";
import { loadExperienceData } from "@/lib/experience-data";
import { loadProfileData } from "@/lib/profile-data";

export const metadata: Metadata = {
  title: "커리어",
  description: "김윤수의 커리어·프로젝트 타임라인 + 학력·자격증·보유 스킬.",
  alternates: { canonical: "/experience" },
};

export const dynamic = "force-static";

export default function ExperiencePage() {
  const profile = loadProfileData();
  const data = loadExperienceData();

  // 커리어 타임라인은 이력서(career 청크) 단일 소스 — 자체 프로젝트도 이력서 항목으로 기록
  const timeline = buildUnifiedTimeline(profile?.career?.subSections[0]?.body);

  const hasSkills = data.skills.frontend.length > 0 || data.skills.smartContract.length > 0;
  const isEmpty =
    timeline.length === 0 && !profile?.education && !profile?.certifications && !hasSkills;

  if (isEmpty) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:max-w-4xl lg:px-8">
        <p className="text-muted">커리어가 준비 중입니다.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-12 md:px-6 lg:max-w-4xl lg:px-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
          커리어
        </h1>
      </header>

      {timeline.length > 0 && (
        <section className="flex flex-col gap-5">
          <h2 className="text-foreground text-[15px] font-medium">커리어 타임라인</h2>
          <UnifiedTimeline items={timeline} />
        </section>
      )}

      {profile?.education && (
        <section className="border-line flex flex-col gap-4 border-t pt-10">
          <h2 className="text-foreground text-[15px] font-medium">학력</h2>
          <CredentialList items={profile.education} />
        </section>
      )}

      {profile?.certifications && (
        <section className="border-line flex flex-col gap-4 border-t pt-10">
          <h2 className="text-foreground text-[15px] font-medium">자격증</h2>
          <CredentialList items={profile.certifications} />
        </section>
      )}

      {hasSkills && <SkillsGrid skills={data.skills} className="border-line border-t pt-10" />}
    </main>
  );
}
