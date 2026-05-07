import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "김윤수 — AI Portfolio",
    template: "%s | 김윤수",
  },
  description: "프론트엔드 개발자 김윤수에게 직접 물어보세요. 노션 기록 기반의 대화형 포트폴리오.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Yoonsoo Kim — AI Portfolio",
    title: "김윤수 — AI Portfolio",
    description:
      "프론트엔드 개발자 김윤수에게 직접 물어보세요. 노션 기록 기반의 대화형 포트폴리오.",
  },
  twitter: {
    card: "summary_large_image",
    title: "김윤수 — AI Portfolio",
    description:
      "프론트엔드 개발자 김윤수에게 직접 물어보세요. 노션 기록 기반의 대화형 포트폴리오.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] font-sans text-white antialiased">
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
