"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { POLL_INTERVAL_SEC } from "@/server/poll-defaults";

const INTERVAL_MS = POLL_INTERVAL_SEC * 1000;

function canRefresh(pathname: string): boolean {
  if (pathname === "/servers/new") {
    return false;
  }
  if (typeof document === "undefined") {
    return false;
  }
  if (document.hidden) {
    return false;
  }
  if (document.querySelector("dialog[open]")) {
    return false;
  }
  return true;
}

export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let timer: number | null = null;

    const tick = () => {
      if (canRefresh(pathname)) {
        router.refresh();
      }
    };

    const start = () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }
      timer = window.setInterval(tick, INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
        return;
      }
      tick();
      start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, router]);

  return null;
}
