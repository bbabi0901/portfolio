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
        "group text-body hover:bg-elevated hover:text-foreground focus-visible:ring-muted relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors focus-visible:ring-1 focus-visible:outline-none",
        "data-[active=true]:text-foreground",
        className,
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="bg-brand absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full"
        />
      )}
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
