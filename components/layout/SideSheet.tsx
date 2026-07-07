"use client";

import { useEffect, useRef } from "react";
import { Briefcase, Github, Linkedin, Mail, MessageCircle, User } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SideMenuItem } from "./SideMenuItem";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

export interface SideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  socials?: { github?: string; linkedin?: string; email?: string };
  lastUpdated?: string;
  className?: string;
}

const MENU_ITEMS = [
  { href: "/", label: "대화", Icon: MessageCircle },
  { href: "/about", label: "자기소개", Icon: User },
  { href: "/experience", label: "기술 이력", Icon: Briefcase },
  { href: "/contact", label: "연락하기", Icon: Mail },
] as const;

function isActive(currentPath: string, href: string): boolean {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function SideSheet({
  open,
  onOpenChange,
  currentPath,
  socials,
  lastUpdated,
  className,
}: SideSheetProps) {
  const lastPathRef = useRef(currentPath);
  useEffect(() => {
    if (lastPathRef.current !== currentPath) {
      lastPathRef.current = currentPath;
      if (open) onOpenChange(false);
    }
  }, [currentPath, open, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className={cn(
          "border-line-subtle bg-background text-foreground flex h-full w-screen max-w-full flex-col gap-0 border-l p-0 motion-reduce:transition-none sm:max-w-none md:w-80",
          className,
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const root = e.currentTarget as HTMLElement | null;
          const firstLink = root?.querySelector<HTMLElement>('a[role="menuitem"], nav a');
          firstLink?.focus();
        }}
      >
        <SheetHeader className="border-line-subtle border-b p-4">
          <SheetTitle className="text-foreground text-sm font-medium">메뉴</SheetTitle>
          <SheetDescription className="sr-only">사이트 내 페이지로 이동합니다.</SheetDescription>
        </SheetHeader>

        <nav aria-label="사이드 메뉴" className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-1">
            {MENU_ITEMS.map((item) => (
              <li key={item.href}>
                <SideMenuItem
                  href={item.href}
                  label={item.label}
                  Icon={item.Icon}
                  active={isActive(currentPath, item.href)}
                  onClick={() => onOpenChange(false)}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-line-subtle border-t p-4">
          <ThemeToggle />
        </div>

        <footer className="border-line-subtle border-t p-4">
          {socials && (socials.github || socials.email || socials.linkedin) ? (
            <div className="flex items-center gap-3">
              {socials.github ? (
                <a
                  href={socials.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                  className="text-muted hover:bg-elevated hover:text-foreground rounded-md p-1.5 transition-colors"
                >
                  <Github size={16} strokeWidth={1.5} aria-hidden="true" />
                </a>
              ) : null}
              {socials.email ? (
                <a
                  href={socials.email}
                  aria-label="Email"
                  className="text-muted hover:bg-elevated hover:text-foreground rounded-md p-1.5 transition-colors"
                >
                  <Mail size={16} strokeWidth={1.5} aria-hidden="true" />
                </a>
              ) : null}
              {socials.linkedin ? (
                <a
                  href={socials.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className="text-muted hover:bg-elevated hover:text-foreground rounded-md p-1.5 transition-colors"
                >
                  <Linkedin size={16} strokeWidth={1.5} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          ) : null}
          {lastUpdated ? (
            <p className="text-subtle mt-3 text-xs">마지막 업데이트: {lastUpdated}</p>
          ) : null}
        </footer>
      </SheetContent>
    </Sheet>
  );
}
