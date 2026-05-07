"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { SideSheet } from "./SideSheet";
import { Footer } from "./Footer";

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
