"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollToTopOnRouteChange() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
