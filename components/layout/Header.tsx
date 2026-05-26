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
        "sticky top-0 z-40 h-14 border-b border-neutral-900 bg-[#0a0a0a]/95 md:h-16",
        className,
      )}
    >
      <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-4 md:px-6 lg:px-8">
        <Link
          href="/"
          className="text-sm font-medium text-neutral-300 transition-colors hover:text-white md:text-base"
        >
          김윤수 — AI Portfolio
        </Link>
        <button
          type="button"
          onClick={onMenuOpen}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none md:p-2.5"
        >
          <Menu size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
