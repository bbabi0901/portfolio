"use client";

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  className?: string;
}

export function EmptyState({ className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}
    >
      <MessageSquare className="h-6 w-6 text-neutral-600" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-xs text-neutral-500">무엇이든 물어봐 주세요. 추천 질문도 좋아요.</p>
    </div>
  );
}
