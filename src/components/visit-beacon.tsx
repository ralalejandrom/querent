"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Counts a page view on each navigation (see /api/collect). No cookies. */
export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const data = JSON.stringify({ p: location.pathname + location.search, r: document.referrer });
    try {
      if (!navigator.sendBeacon?.("/api/collect", data)) fetch("/api/collect", { method: "POST", body: data, keepalive: true }).catch(() => {});
    } catch { /* counting is best-effort */ }
  }, [pathname]);
  return null;
}
