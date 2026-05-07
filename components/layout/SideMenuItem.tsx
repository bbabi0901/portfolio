"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SideMenuItemProps {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  onClick?: () => void;
  className?: string;
}

export function SideMenuItem({ href, label, Icon, active, onClick, className }: SideMenuItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      data-active={active}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400",
        "data-[active=true]:text-white",
        className,
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-lime-300"
        />
      )}
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
