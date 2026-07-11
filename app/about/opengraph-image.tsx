import { ogCard, OG_SIZE } from "@/lib/og-card";

export const dynamic = "force-static";
export const alt = "자기소개 | 김윤수 — 가치관, 성격, 취미";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({
    title: "자기소개",
    subtitle: "프론트엔드 개발자 김윤수의 가치관, 성격, 취미",
  });
}
