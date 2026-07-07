"use client";

import { cn } from "@/lib/utils";

export interface SuggestionBadgeProps {
  text: string;
  category: string;
  visited?: boolean;
  onClick: () => void;
  className?: string;
}

export function SuggestionBadge({
  text,
  category,
  visited = false,
  onClick,
  className,
}: SuggestionBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-visited={visited ? "true" : "false"}
      data-category={category}
      className={cn(
        "border-line text-body shrink-0 rounded-full border bg-transparent px-3 py-1.5 text-xs",
        "hover:border-line-strong hover:text-foreground",
        "focus-visible:ring-muted focus-visible:ring-1 focus-visible:outline-none",
        "transition-colors",
        visited && "opacity-60",
        className,
      )}
    >
      {text}
    </button>
  );
}
