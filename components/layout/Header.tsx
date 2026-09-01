"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HeaderProps {
  onMenuOpen: () => void;
  menuOpen: boolean;
  className?: string;
}

export function Header({ onMenuOpen, menuOpen, className }: HeaderProps) {
  return (
    <header
      className={cn(
        "border-line-subtle bg-background/95 sticky top-0 z-40 h-14 border-b md:h-16",
        className,
      )}
    >
      <nav
        aria-label="주 메뉴"
        className="mx-auto flex h-full max-w-3xl items-center justify-between px-4 md:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="text-body hover:text-foreground text-sm font-medium transition-colors md:text-base"
        >
          김윤수 — AI Portfolio
        </Link>
        <button
          type="button"
          onClick={onMenuOpen}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          className="text-muted hover:bg-elevated hover:text-foreground focus-visible:ring-muted rounded-md p-2 transition-colors focus-visible:ring-1 focus-visible:outline-none md:p-2.5"
        >
          <Menu size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </nav>
    </header>
  );
}
