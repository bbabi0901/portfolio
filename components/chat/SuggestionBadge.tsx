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
        "shrink-0 rounded-full border border-neutral-800 bg-transparent px-3 py-1.5 text-xs text-neutral-300",
        "hover:border-neutral-600 hover:text-white",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400",
        "transition-colors",
        visited && "opacity-60",
        className,
      )}
    >
      {text}
    </button>
  );
}
