import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { LayoutClient } from "@/components/layout/LayoutClient";
import { JsonLdPerson } from "@/components/seo/JsonLdPerson";
import { loadPortfolio } from "@/lib/portfolio-data";
import "./globals.css";

const KST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getLastUpdatedKst(): string | undefined {
  try {
    const data = loadPortfolio();
    const date = new Date(data.generatedAt);
    if (Number.isNaN(date.getTime())) return undefined;
    return KST_DATE_FORMAT.format(date);
  } catch {
    return undefined;
  }
}

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
  const lastUpdated = getLastUpdatedKst();
  const socials = {
    github: "https://github.com/YoonsooKim9",
    email: "mailto:bbabi0901@gmail.com",
  };

  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] font-sans text-white antialiased">
        <LayoutClient lastUpdated={lastUpdated} socials={socials}>
          {children}
        </LayoutClient>
        <Toaster richColors />
        <JsonLdPerson />
      </body>
    </html>
  );
}
