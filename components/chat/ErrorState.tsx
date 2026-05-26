"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  message: string;
  retryAfterSeconds?: number;
  onRetry?: () => void;
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
      className="mt-1 text-[11px] text-red-300/80 tabular-nums"
    >
      {remaining}초 뒤 다시 시도할 수 있어요
    </p>
  );
}

export function ErrorState({ message, retryAfterSeconds, onRetry, className }: ErrorStateProps) {
  const showCountdown = retryAfterSeconds !== undefined && retryAfterSeconds > 0;

  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "mx-auto my-4 flex max-w-md items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3",
        className,
      )}
    >
      <TriangleAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-red-300"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="flex-1 text-xs">
        <p className="text-red-200">{message}</p>
        {showCountdown && <Countdown seconds={retryAfterSeconds!} />}
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRetry}
          disabled={showCountdown}
          className="text-red-200 hover:bg-red-950/50 hover:text-red-100"
        >
          다시 시도
        </Button>
      )}
    </div>
  );
}
