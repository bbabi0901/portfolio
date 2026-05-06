import Link from "next/link";

export const metadata = {
  title: "페이지를 찾을 수 없어요",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 md:px-6 lg:px-8 py-24 text-center">
      <p className="text-sm font-mono text-neutral-500">404</p>
      <h1 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight text-white">
        페이지를 찾을 수 없어요
      </h1>
      <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
        요청하신 페이지가 이동되었거나 더 이상 존재하지 않을 수 있어요.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
