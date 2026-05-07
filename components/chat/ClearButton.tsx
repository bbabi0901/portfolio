"use client";

import { Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ClearButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}

export function ClearButton({
  open,
  onOpenChange,
  onConfirm,
  disabled,
  className,
}: ClearButtonProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="새 대화"
          title="새 대화 (⌘K)"
          disabled={disabled}
          className={cn("text-neutral-400 hover:text-white", className)}
        >
          <Trash2 strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-slot="clear-conversation-popover"
        className="w-72"
      >
        <div className="text-sm font-medium text-neutral-200">
          대화를 모두 지울까요?
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          답변과 입력 메시지가 모두 삭제됩니다. 첫 인사는 그대로 남아요.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button type="button" size="sm" onClick={onConfirm}>
            지우기
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
