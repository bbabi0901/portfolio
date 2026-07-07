import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "잠시 후 다시 만나요",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-4xl">🌙</p>
      <h1 className="text-foreground text-2xl font-semibold">오늘의 대화 한도에 도달했어요</h1>
      <p className="text-muted">내일 KST 00:00에 초기화됩니다.</p>
      <a href="mailto:bbabi0901@gmail.com" className="text-brand underline underline-offset-4">
        bbabi0901@gmail.com
      </a>
      <Link href="/" className="text-subtle hover:text-body mt-4 text-sm">
        ← 홈으로
      </Link>
    </main>
  );
}
