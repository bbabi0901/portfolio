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
  const chipClass = cn(
    "border-line-strong text-muted inline-flex items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 text-[11px]",
    "hover:border-line-strong hover:text-foreground",
    "focus-visible:ring-muted focus-visible:ring-1 focus-visible:outline-none",
    "transition-colors",
    className,
  );
  const inner = (
    <>
      <LinkIcon className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
      <span className="text-subtle font-mono text-[10px]">[{index}]</span>
      <span className="max-w-[12rem] truncate">{citation.sourceTitle}</span>
    </>
  );

  if (!isPrivate) {
    // 내부 페이지로 재게시된 출처 — 새 탭으로 열어 대화 상태 보존
    return (
      <a
        href={citation.sourceUrl!}
        target="_blank"
        rel="noopener noreferrer"
        data-slot="source-citation"
        data-private="false"
        title={citation.sourceTitle}
        aria-label={label}
        onClick={(e) => {
          onClick(citation);
          // cmd/ctrl/shift 클릭은 브라우저 기본 동작(백그라운드 탭 등)에 맡긴다
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          // 웹뷰·미리보기 패널 등 새 탭 차단 환경 폴백: open 이 막히면 같은 탭 이동
          e.preventDefault();
          const w = window.open(citation.sourceUrl!, "_blank", "noopener,noreferrer");
          if (!w) window.location.assign(citation.sourceUrl!);
        }}
        className={cn(chipClass, "no-underline")}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      data-slot="source-citation"
      data-private="true"
      disabled
      title="이 출처는 비공개입니다"
      aria-label={`${label} (비공개)`}
      className={cn(
        chipClass,
        "disabled:hover:border-line-strong disabled:hover:text-muted disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {inner}
    </button>
  );
}
