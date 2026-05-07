"use client";

import {
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 144;
const COUNTER_THRESHOLD = 100;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "메시지를 입력하세요…",
  maxLength = 500,
  className,
  autoFocus,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function submit() {
    if (disabled) return;
    const text = value.trim().slice(0, maxLength);
    if (text.length === 0) return;
    onSubmit(text);
    onChange("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    const composing =
      isComposingRef.current ||
      e.nativeEvent.isComposing ||
      e.keyCode === 229;
    if (composing) return;
    e.preventDefault();
    submit();
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    if (next.length > maxLength) {
      onChange(next.slice(0, maxLength));
    } else {
      onChange(next);
    }
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  const trimmedLength = value.trim().length;
  const canSubmit = !disabled && trimmedLength > 0;
  const remaining = maxLength - value.length;
  const showCounter = remaining <= COUNTER_THRESHOLD;

  return (
    <form
      data-slot="composer"
      onSubmit={handleFormSubmit}
      className={cn(
        "flex items-end gap-2 border-t border-neutral-800 bg-[#0a0a0a]/95 p-3 pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          data-slot="composer-textarea"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          className={cn(
            "block w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900",
            "px-4 py-3 text-[15px] leading-relaxed text-white md:text-sm",
            "placeholder:text-neutral-500",
            "focus:border-neutral-600 focus:outline-none",
            "min-h-[44px] max-h-[144px] overflow-y-auto",
          )}
        />
      </div>
      {showCounter && (
        <span
          data-slot="composer-counter"
          aria-live="polite"
          className={cn(
            "select-none self-end pb-3 text-xs tabular-nums",
            remaining < 0 ? "text-red-400" : "text-neutral-500",
          )}
        >
          {remaining}
        </span>
      )}
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        disabled={!canSubmit}
        aria-label="전송"
        className="self-end text-neutral-400 hover:text-white"
      >
        <Send aria-hidden="true" />
      </Button>
    </form>
  );
}
