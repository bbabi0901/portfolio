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
        "inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-transparent px-2 py-0.5 text-[11px] text-neutral-400",
        "hover:border-neutral-500 hover:text-neutral-200",
        "focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-700 disabled:hover:text-neutral-400",
        "transition-colors",
        className,
      )}
    >
      <LinkIcon className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
      <span className="font-mono text-[10px] text-neutral-500">[{index}]</span>
      <span className="max-w-[12rem] truncate">{citation.sourceTitle}</span>
    </button>
  );
}
