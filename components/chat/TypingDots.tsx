"use client";

import { cn } from "@/lib/utils";

export interface TypingDotsProps {
  className?: string;
  ariaLabel?: string;
}

const DOT_DELAYS_MS = [0, 150, 300] as const;

export function TypingDots({ className, ariaLabel = "응답 생성 중" }: TypingDotsProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={cn("text-muted inline-flex items-center gap-1", className)}
    >
      {DOT_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          data-slot="typing-dot"
          aria-hidden="true"
          className="inline-block h-1 w-1 animate-[typing-dot_0.4s_ease-in-out_infinite] rounded-full bg-current motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
