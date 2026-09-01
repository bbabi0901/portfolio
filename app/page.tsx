import type { Metadata } from "next";

import { LandingHero } from "@/components/landing/LandingHero";
import { loadSpec } from "@/lib/spec-loader";
import { loadSuggestions } from "@/lib/suggestions-loader";
import { loadPortfolio } from "@/lib/portfolio-data";
import { resolveProfileImageUrl } from "@/lib/profile-data";

export const metadata: Metadata = {
  title: "김윤수 — AI Portfolio",
  description: "프론트엔드 개발자 김윤수의 대화형 포트폴리오. 무엇이든 물어보세요.",
  alternates: { canonical: "/" },
};

export const dynamic = "force-static";

/** 랜딩 인사말 (타이핑 효과로 표시) */
const HEADLINE = "안녕하세요, 프론트엔드 개발자 김윤수입니다.";
const SUBLINE = "궁금한 건 무엇이든 물어보세요.";

/** 랜딩 칩: 짧은 질문 위주 상위 4개 */
const MAX_CHIPS = 4;
const MAX_CHIP_LENGTH = 20;

export default function LandingPage() {
  const spec = loadSpec();
  const suggestions = loadSuggestions(spec);
  const chips = suggestions.filter((q) => q.text.length <= MAX_CHIP_LENGTH).slice(0, MAX_CHIPS);

  let imageUrl: string | null = null;
  try {
    imageUrl = resolveProfileImageUrl(loadPortfolio().profile.oneLiner);
  } catch {
    // 데이터 없으면 아바타 생략
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl items-center px-4 py-12 md:min-h-[calc(100dvh-4rem)] md:px-6 lg:px-8"
    >
      <LandingHero
        headline={HEADLINE}
        subline={SUBLINE}
        chips={chips}
        imageUrl={imageUrl}
        className="w-full"
      />
    </main>
  );
}
