import { ogCard, OG_SIZE } from "@/lib/og-card";

export const dynamic = "force-static";
export const alt = "커리어 | 김윤수 — 커리어·프로젝트 타임라인 + 학력·자격증·스킬";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({
    title: "커리어",
    subtitle: "커리어·프로젝트 타임라인 + 학력·자격증·보유 스킬",
  });
}
