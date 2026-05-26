"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ProjectCategory } from "@/lib/experience-data";
import { cn } from "@/lib/utils";

export interface CategoryFilterProps {
  options: ProjectCategory[];
  className?: string;
}

const PARAM_KEY = "category";

export function CategoryFilter({ options, className }: CategoryFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(PARAM_KEY) ?? "";

  function navigate(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set(PARAM_KEY, next);
    } else {
      params.delete(PARAM_KEY);
    }
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    router.push(url, { scroll: false });
  }

  const filters: Array<{ key: string; label: string }> = [
    { key: "", label: "전체" },
    ...options.map((o) => ({ key: o, label: o })),
  ];

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="카테고리 필터">
      {filters.map(({ key, label }) => {
        const active = current === key;
        return (
          <button
            key={label}
            type="button"
            data-active={active}
            onClick={() => navigate(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none",
              active
                ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                : "border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-white",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
