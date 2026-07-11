import { ogCard, OG_SIZE } from "@/lib/og-card";

export const dynamic = "force-static";
export const alt = "AI 채팅 | 김윤수 — 김윤수에게 무엇이든 물어보세요";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogCard({
    title: "AI 채팅",
    subtitle: "김윤수에게 무엇이든 물어보세요",
  });
}
