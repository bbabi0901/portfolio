"use client";

import { Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types/chat";

export interface SourceCitationProps {
  citation: Citation;
  index: number;
  onClick: (citation: Citation) => void;
  className?: string;
}

export function SourceCitation({ citation, index, onClick, className }: SourceCitationProps) {
  const isPrivate = citation.sourceUrl === null;
  const label = `${index}. ${citation.sourceTitle}`;

  return (
    <button
      type="button"
      data-slot="source-citation"
      data-private={isPrivate ? "true" : "false"}
      disabled={isPrivate}
      title={isPrivate ? "이 출처는 비공개입니다" : citation.sourceTitle}
      aria-label={isPrivate ? `${label} (비공개)` : label}
      onClick={() => {
        if (!isPrivate) onClick(citation);
      }}
      className={cn(
        "border-line-strong text-muted inline-flex items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 text-[11px]",
        "hover:border-line-strong hover:text-foreground",
        "focus-visible:ring-muted focus-visible:ring-1 focus-visible:outline-none",
        "disabled:hover:border-line-strong disabled:hover:text-muted disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors",
        className,
      )}
    >
      <LinkIcon className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
      <span className="text-subtle font-mono text-[10px]">[{index}]</span>
      <span className="max-w-[12rem] truncate">{citation.sourceTitle}</span>
    </button>
  );
}
