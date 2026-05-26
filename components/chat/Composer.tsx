"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
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
  /** Composer 하단 액션 row 좌측에 인라인 렌더되는 children (예: ModelSwitcher). FEAT-030. */
  leftAction?: ReactNode;
}

export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  {
    value,
    onChange,
    onSubmit,
    disabled = false,
    placeholder = "메시지를 입력하세요 — 김윤수에게 직접 물어보세요",
    maxLength = 500,
    className,
    autoFocus,
    leftAction,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

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
    const composing = isComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229;
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
        "rounded-3xl border border-neutral-700 bg-neutral-900/40",
        "px-3 py-2 md:px-4 md:py-3",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
        "transition-colors",
        "focus-within:border-neutral-500 focus-within:bg-neutral-900/60",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <textarea
        ref={textareaRef}
        data-slot="composer-textarea"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        aria-label="채팅 메시지 입력"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        className={cn(
          "block w-full resize-none bg-transparent",
          "text-[15px] leading-relaxed text-white md:text-sm",
          "placeholder:text-neutral-500",
          "outline-none focus:outline-none",
          "max-h-[144px] min-h-[24px] overflow-y-auto",
        )}
      />
      <div data-slot="composer-actions" className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">{leftAction}</div>
        <div className="flex items-center gap-2">
          {showCounter && (
            <span
              data-slot="composer-counter"
              aria-live="polite"
              className={cn(
                "text-xs tabular-nums select-none",
                remaining < 0 ? "text-red-400" : "text-neutral-500",
              )}
            >
              {remaining}
            </span>
          )}
          <Button
            type="submit"
            size="icon"
            variant="default"
            disabled={!canSubmit}
            aria-label="메시지 전송"
            className="size-8 rounded-full md:size-9"
          >
            <Send aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  );
});
