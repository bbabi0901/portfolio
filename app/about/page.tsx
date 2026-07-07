import type { Metadata } from "next";

import { AboutHero } from "@/components/about/AboutHero";
import { AboutSection } from "@/components/about/AboutSection";
import { loadProfileData } from "@/lib/profile-data";

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

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 md:px-6 lg:px-8">
      <AboutHero
        intro={profile.intro}
        imageUrl={profile.imageUrl}
        totalReadingMinutes={profile.totalReadingMinutes}
      />
      {profile.sections.map((section) => (
        <AboutSection
          key={section.heading}
          heading={section.heading}
          subSections={section.subSections}
          className="mt-12 border-t border-neutral-800 pt-10"
        />
      ))}
    </main>
  );
}
