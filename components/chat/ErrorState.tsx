"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  message: string;
  retryAfterSeconds?: number;
  onRetry?: () => void;
  kind?: "default" | "token-budget";
  className?: string;
}

interface CountdownProps {
  seconds: number;
}

function Countdown({ seconds }: CountdownProps) {
  const [remaining, setRemaining] = useState<number>(seconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => {
      setRemaining((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [seconds]);

  if (remaining <= 0) return null;

  return (
    <p
      data-slot="error-countdown"
      aria-live="polite"
      className="text-danger/80 mt-1 text-[11px] tabular-nums"
    >
      {remaining}초 뒤 다시 시도할 수 있어요
    </p>
  );
}

export function ErrorState({
  message,
  retryAfterSeconds,
  onRetry,
  kind = "default",
  className,
}: ErrorStateProps) {
  const showCountdown = retryAfterSeconds !== undefined && retryAfterSeconds > 0;

  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "border-danger-border bg-danger-surface mx-auto my-4 flex max-w-md items-start gap-3 rounded-lg border p-3",
        className,
      )}
    >
      <TriangleAlert
        className="text-danger mt-0.5 h-4 w-4 shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="flex-1 text-xs">
        <p className="text-danger">{message}</p>
        {showCountdown && <Countdown seconds={retryAfterSeconds!} />}
      </div>
      {kind === "token-budget" && (
        <Link
          href="/maintenance"
          className="text-danger hover:text-danger text-xs underline underline-offset-2"
        >
          자세히 보기
        </Link>
      )}
      {onRetry && kind !== "token-budget" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRetry}
          disabled={showCountdown}
          className="text-danger hover:bg-danger-surface hover:text-danger"
        >
          다시 시도
        </Button>
      )}
    </div>
  );
}
