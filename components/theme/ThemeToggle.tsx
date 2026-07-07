"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "시스템", Icon: Monitor },
  { value: "light", label: "라이트", Icon: Sun },
  { value: "dark", label: "다크", Icon: Moon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // next-themes 표준 마운트 가드 — 서버/클라이언트 theme 불일치로 인한 hydration mismatch 방지
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // 마운트 전에는 활성 표시를 비워 hydration mismatch 방지
  const current = mounted ? (theme ?? "system") : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-subtle px-1 text-xs font-medium">테마</span>
      <div
        role="radiogroup"
        aria-label="테마 선택"
        className="border-line grid grid-cols-3 gap-1 rounded-lg border p-1"
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
                active
                  ? "bg-elevated text-foreground"
                  : "text-muted hover:bg-elevated/60 hover:text-foreground",
              )}
            >
              <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
