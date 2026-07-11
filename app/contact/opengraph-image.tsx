import { ogCard, OG_SIZE } from "@/lib/og-card";

export const dynamic = "force-static";
export const alt = "연락하기 | 김윤수 — 채용·협업 문의";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({
    title: "연락하기",
    subtitle: "채용·협업 문의 — 폼 또는 이메일로 연락 주세요",
  });
}
