"use client";

import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FeedbackButtonsProps {
  messageId: string;
  alreadySent: boolean;
  onUp: () => void;
  onDownStart: () => void;
  className?: string;
}

export function FeedbackButtons({
  messageId,
  alreadySent,
  onUp,
  onDownStart,
  className,
}: FeedbackButtonsProps) {
  const baseBtn = cn(
    "inline-flex items-center justify-center rounded-md p-1.5 text-neutral-400",
    "hover:text-neutral-200 hover:bg-neutral-900",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400",
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400",
    "transition-colors",
  );

  return (
    <div
      data-slot="feedback-buttons"
      data-message-id={messageId}
      className={cn("inline-flex items-center gap-1", className)}
    >
      <button
        type="button"
        aria-label="도움이 됐어요"
        title="도움이 됐어요"
        disabled={alreadySent}
        onClick={onUp}
        className={baseBtn}
      >
        <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="도움이 안 됐어요"
        title="도움이 안 됐어요"
        disabled={alreadySent}
        onClick={onDownStart}
        className={baseBtn}
      >
        <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
