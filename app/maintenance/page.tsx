import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "잠시 후 다시 만나요",
  robots: { index: false, follow: false },
}

export default function MaintenancePage() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-4xl">🌙</p>
      <h1 className="text-2xl font-semibold text-neutral-100">오늘의 대화 한도에 도달했어요</h1>
      <p className="text-neutral-400">내일 KST 00:00에 초기화됩니다.</p>
      <a href="mailto:bbabi0901@gmail.com" className="text-lime-300 underline underline-offset-4">
        bbabi0901@gmail.com
      </a>
      <Link href="/" className="mt-4 text-sm text-neutral-500 hover:text-neutral-300">
        ← 홈으로
      </Link>
    </main>
  )
}
