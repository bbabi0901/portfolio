"use client";

import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface JumpToLatestButtonProps {
  visible: boolean;
  onClick: () => void;
  className?: string;
}

export function JumpToLatestButton({ visible, onClick, className }: JumpToLatestButtonProps) {
  if (!visible) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label="가장 최신 메시지로 이동"
      className={cn(
        "gap-1.5 rounded-full text-xs text-neutral-300",
        "animate-[fade-in_0.2s_ease-out] motion-reduce:animate-none",
        className,
      )}
    >
      <ArrowDown strokeWidth={1.5} className="size-3.5" aria-hidden="true" />
      <span>최신으로</span>
    </Button>
  );
}
