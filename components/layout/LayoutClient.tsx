"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { SideSheet } from "./SideSheet";
import { Footer } from "./Footer";
import { ScrollToTopOnRouteChange } from "./ScrollToTopOnRouteChange";

export interface LayoutClientProps {
  children: React.ReactNode;
  lastUpdated?: string;
  socials?: { github?: string; email?: string; linkedin?: string };
}

const TOGGLE_DEBOUNCE_MS = 80;

export function LayoutClient({ children, lastUpdated, socials }: LayoutClientProps) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const lastToggleAtRef = useRef(0);

  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const handleMenuOpen = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAtRef.current < TOGGLE_DEBOUNCE_MS) return;
    lastToggleAtRef.current = now;
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return (
    <>
      <a
        href="#main-content"
        className="bg-foreground text-background focus:ring-muted sr-only rounded-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:outline-none"
      >
        본문으로 건너뛰기
      </a>
      <ScrollToTopOnRouteChange />
      <Header onMenuOpen={handleMenuOpen} menuOpen={open} />
      <SideSheet
        open={open}
        onOpenChange={handleOpenChange}
        currentPath={pathname}
        socials={socials}
        lastUpdated={lastUpdated}
      />
      {children}
      <Footer lastUpdated={lastUpdated} socials={socials} />
    </>
  );
}
