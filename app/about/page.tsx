import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";

import { AboutHero } from "@/components/about/AboutHero";
import { AboutSection } from "@/components/about/AboutSection";
import { loadProfileData } from "@/lib/profile-data";

const CAREER_HEADING = "기술 이력";

export const metadata: Metadata = {
  title: "자기소개",
  description: "프론트엔드 개발자 김윤수의 가치관, 성격, 취미.",
  alternates: { canonical: "/about" },
};

export const dynamic = "force-static";

export default function AboutPage() {
  const profile = loadProfileData();

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 md:px-6 lg:px-8">
        <p className="text-neutral-400">자기소개 페이지가 준비 중입니다.</p>
      </main>
    );
  }

  const sections = profile.sections.filter((s) => s.heading !== CAREER_HEADING);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 md:px-6 lg:px-8">
      <AboutHero
        imageUrl={profile.imageUrl}
        contact={profile.contact}
      />
      {sections.map((section) => (
        <AboutSection
          key={section.heading}
          heading={section.heading}
          subSections={section.subSections}
          className="mt-12 border-t border-neutral-800 pt-10"
        />
      ))}

      <Link
        href="/experience"
        className="group mt-12 flex items-center gap-4 rounded-lg border border-neutral-800 p-5 transition-colors hover:border-neutral-600"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-neutral-800 text-neutral-400 transition-colors group-hover:border-neutral-600 group-hover:text-neutral-200">
          <Briefcase size={18} strokeWidth={1.5} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[14px] font-medium text-neutral-200">기술 이력이 궁금하다면?</span>
          <span className="text-[12px] text-neutral-500">회사·프로젝트 타임라인과 보유 스킬 보기</span>
        </span>
        <ArrowRight
          size={16}
          strokeWidth={1.5}
          className="ml-auto shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-300"
        />
      </Link>
    </main>
  );
}
