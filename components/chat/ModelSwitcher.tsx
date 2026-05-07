"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ModelId = "gpt-4o-mini" | "claude-3-5-haiku-latest" | "gemini-2.0-flash-exp";

const MODEL_LABELS: Record<ModelId, string> = {
  "gpt-4o-mini": "GPT-4o mini",
  "claude-3-5-haiku-latest": "Claude 3.5 Haiku",
  "gemini-2.0-flash-exp": "Gemini 2.0 Flash",
};

export interface ModelSwitcherProps {
  value: ModelId;
  onChange: (id: ModelId) => void;
  available: ModelId[];
  className?: string;
}

export function ModelSwitcher({ value, onChange, available, className }: ModelSwitcherProps) {
  const disabled = available.length === 0;

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as ModelId)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label="답변 모델 선택"
        className={cn("min-w-[160px]", className)}
      >
        <SelectValue placeholder={disabled ? "사용 가능한 모델 없음" : MODEL_LABELS[value]}>
          {MODEL_LABELS[value]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {available.map((id) => (
          <SelectItem key={id} value={id}>
            {MODEL_LABELS[id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
