import type { JSX } from "react";

import { cn } from "@/lib/utils";
import type { CredentialItem } from "@/lib/profile-data";

/** 학력·자격증 공용 행 리스트 — 제목/부제 좌, 기간 우 (시안 확정 레이아웃) */
export interface CredentialListProps {
  items: CredentialItem[];
  className?: string;
}

export function CredentialList({ items, className }: CredentialListProps): JSX.Element {
  return (
    <ul className={cn("flex flex-col", className)}>
      {items.map((item, idx) => (
        <li
          key={`${item.title}-${idx}`}
          className={cn(
            "flex items-baseline justify-between gap-4 py-2.5",
            idx < items.length - 1 && "border-line/60 border-b",
          )}
        >
          <div className="min-w-0">
            <p className="text-foreground text-[13px] leading-snug font-medium">{item.title}</p>
            {item.subtitle && (
              <p className="text-subtle mt-0.5 text-[11px] leading-snug">{item.subtitle}</p>
            )}
          </div>
          {item.period && <p className="text-subtle shrink-0 text-[11px]">{item.period}</p>}
        </li>
      ))}
    </ul>
  );
}
