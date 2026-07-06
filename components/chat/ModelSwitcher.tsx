"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ModelId } from "@/lib/models";

export type { ModelId };

const MODEL_LABELS_LONG: Record<ModelId, string> = {
  "gpt-4o-mini": "GPT-4o mini",
  "claude-3-5-haiku": "Claude 3.5 Haiku",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
};

const MODEL_LABELS_SHORT: Record<ModelId, string> = {
  "gpt-4o-mini": "GPT-4o",
  "claude-3-5-haiku": "Haiku",
  "gemini-2.0-flash": "Gemini",
};

export interface ModelSwitcherProps {
  value: ModelId;
  onChange: (id: ModelId) => void;
  available: ModelId[];
  /** sm 에서 짧은 라벨 사용 (예: "GPT-4o" vs "GPT-4o mini"). 기본 false (full). */
  compact?: boolean;
  className?: string;
}

export function toLongLabel(id: ModelId): string {
  return MODEL_LABELS_LONG[id] ?? id;
}

export function toShortLabel(id: ModelId): string {
  return MODEL_LABELS_SHORT[id] ?? id;
}

export function ModelSwitcher({
  value,
  onChange,
  available,
  compact = false,
  className,
}: ModelSwitcherProps) {
  const disabled = available.length === 0;
  const label = compact ? toShortLabel(value) : toLongLabel(value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ModelId)} disabled={disabled}>
      <SelectTrigger
        size="sm"
        aria-label="답변 모델 선택"
        className={cn(
          "h-8 gap-1 rounded-full border-neutral-700 bg-transparent px-3 text-xs text-neutral-300",
          "hover:border-neutral-500 hover:text-white",
          "focus:outline-none focus-visible:ring-0",
          "data-[disabled]:opacity-50",
          className,
        )}
      >
        <SelectValue placeholder={disabled ? "사용 가능한 모델 없음" : label}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="border border-neutral-700 bg-neutral-900 text-neutral-200">
        {available.map((id) => (
          <SelectItem key={id} value={id} className="text-xs">
            {toLongLabel(id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
