"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SuggestedQuestionMeta } from "@/types/portfolio";

/** 랜딩 타이핑 타이밍 (chat greeting 과 무관, 매 방문 재생) */
const TYPING_START_DELAY_MS = 300;
const WORD_INTERVAL_MS: [number, number] = [40, 80];

export interface LandingHeroProps {
  headline: string;
  subline: string;
  chips: SuggestedQuestionMeta[];
  imageUrl: string | null;
  className?: string;
}

function tokenize(message: string): string[] {
  return message.match(/\S+|\s+/g) ?? [];
}

function usePrefersReducedMotion(): boolean {
  const subscribe = (callback: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return () => {};
    }
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    m.addEventListener("change", callback);
    return () => m.removeEventListener("change", callback);
  };
  const getSnapshot = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** 단어 단위 타이핑 효과 — reduced-motion 시 즉시 전체 표시 */
function useTypedText(message: string): { text: string; done: boolean } {
  const reducedMotion = usePrefersReducedMotion();
  const words = useMemo(() => tokenize(message), [message]);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (reducedMotion) return; // 렌더 파생값으로 즉시 전체 표시
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const [min, max] = WORD_INTERVAL_MS;
    let cumulative = TYPING_START_DELAY_MS;
    for (let i = 1; i <= words.length; i++) {
      cumulative += min + Math.random() * Math.max(0, max - min);
      timers.push(setTimeout(() => setRevealed(i), cumulative));
    }
    return () => timers.forEach(clearTimeout);
  }, [words, reducedMotion]);

  const shown = reducedMotion ? words.length : Math.min(revealed, words.length);
  return { text: words.slice(0, shown).join(""), done: shown >= words.length };
}

export function LandingHero({
  headline,
  subline,
  chips,
  imageUrl,
  className,
}: LandingHeroProps): JSX.Element {
  const router = useRouter();
  const full = `${headline}\n${subline}`;
  const { text, done } = useTypedText(full);

  const [typedLine1 = "", typedLine2] = text.split("\n");

  const goChat = (question?: string) => {
    router.push(question ? `/chat?q=${encodeURIComponent(question)}` : "/chat");
  };

  return (
    <section className={cn("flex flex-col items-center gap-8 text-center", className)}>
      {/* 아바타 + 상태 점 */}
      <div className="relative">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="김윤수"
            width={80}
            height={80}
            priority
            className="border-line size-16 rounded-full border object-cover md:size-20"
          />
        ) : (
          <div className="border-line bg-elevated size-16 rounded-full border md:size-20" />
        )}
        <span
          aria-hidden="true"
          className="bg-brand border-background absolute right-0.5 bottom-0.5 size-3 rounded-full border-2 md:size-3.5"
        />
      </div>

      {/* 타이핑 인사 헤드라인 */}
      <h1
        aria-label={full}
        className="text-foreground min-h-[4.5rem] text-2xl font-semibold tracking-tight text-balance whitespace-pre-line md:min-h-[5.5rem] md:text-4xl"
      >
        <span aria-hidden="true">
          {typedLine1}
          {typedLine2 !== undefined && (
            <>
              {"\n"}
              <span className="text-muted font-medium">{typedLine2}</span>
            </>
          )}
          {!done && <span className="text-brand">▍</span>}
        </span>
      </h1>

      {/* 추천 질문 칩 */}
      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center justify-center gap-2">
          {chips.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => goChat(q.text)}
                className="border-line text-body hover:border-line-strong hover:text-foreground rounded-full border px-3.5 py-1.5 text-[13px] transition-colors"
              >
                {q.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 채팅 인풋 (클릭 시 /chat 이동) */}
      <button
        type="button"
        aria-label="궁금한 것 물어보기 — 대화 페이지로 이동"
        onClick={() => goChat()}
        onFocus={() => router.prefetch("/chat")}
        onMouseEnter={() => router.prefetch("/chat")}
        className="border-line-strong bg-elevated/40 hover:bg-elevated/60 flex w-full max-w-xl cursor-text items-center gap-3 rounded-3xl border px-4 py-3 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-colors md:px-5 md:py-3.5"
      >
        <span className="text-muted flex-1 text-[14px] md:text-[15px]">궁금한 것 물어보기</span>
        <span className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-full md:size-9">
          <ArrowUp size={16} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}
