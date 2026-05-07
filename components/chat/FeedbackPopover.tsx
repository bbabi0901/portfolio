"use client";

import { useId, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FeedbackReason = "inaccurate" | "off-topic" | "incomplete" | "other";

const REASONS: ReadonlyArray<{ value: FeedbackReason; label: string }> = [
  { value: "inaccurate", label: "정보가 정확하지 않아요" },
  { value: "off-topic", label: "내가 원한 답이 아니에요" },
  { value: "incomplete", label: "관련 내용이 부족해요" },
  { value: "other", label: "기타 (직접 입력)" },
];

export interface FeedbackPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: FeedbackReason, detail?: string) => void;
  trigger: React.ReactNode;
  className?: string;
}

export function FeedbackPopover({
  open,
  onOpenChange,
  onSubmit,
  trigger,
  className,
}: FeedbackPopoverProps) {
  const titleId = useId();
  const descId = useId();
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [detail, setDetail] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason(null);
      setDetail("");
    }
    onOpenChange(next);
  }

  const isOther = reason === "other";
  const detailValid = !isOther || (detail.trim().length >= 1 && detail.trim().length <= 500);
  const canSubmit = reason !== null && detailValid;

  function handleSubmit() {
    if (!reason) return;
    onSubmit(reason, isOther ? detail.trim() : undefined);
    handleOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className={cn("w-80", className)}
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div id={titleId} className="text-sm font-medium text-neutral-200">
          어떤 부분이 아쉬웠나요?
        </div>
        <p id={descId} className="mt-1 text-xs text-neutral-500">
          이유를 알려주시면 답변을 보강하는 데 큰 도움이 됩니다.
        </p>
        <RadioGroup
          className="mt-3 gap-2"
          value={reason ?? ""}
          onValueChange={(v) => setReason(v as FeedbackReason)}
        >
          {REASONS.map((r) => {
            const id = `${titleId}-${r.value}`;
            return (
              <div key={r.value} className="flex items-center gap-2">
                <RadioGroupItem id={id} value={r.value} />
                <Label htmlFor={id} className="text-xs text-neutral-300">
                  {r.label}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
        {isOther && (
          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={500}
            placeholder="아쉬운 점을 적어주세요 (1~500자)"
            className="mt-3 min-h-[80px] text-xs"
            aria-label="기타 사유 상세"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            제출
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
