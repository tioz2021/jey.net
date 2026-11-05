"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useUser } from "@/lib/user-context";

function send(name: string, path: string) {
  const body = JSON.stringify({
    name,
    path,
    locale: document.documentElement.lang || undefined,
  });
  void fetch("/api/v1/analytics/event", {
    method: "POST",
    keepalive: true,
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => undefined);
}

/**
 * Cookie-less page analytics. Only the normalised route and event name are
 * stored; no titles, notes, emails or user ids.
 */
export function Analytics() {
  const pathname = usePathname();
  const { user } = useUser();

  useEffect(() => {
    if (!user || navigator.doNotTrack === "1") return;
    const path = window.location.pathname;
    const ping = () => {
      void fetch("/api/v1/me/presence", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      }).catch(() => undefined);
    };
    ping();
    const timer = window.setInterval(ping, 60_000);
    return () => window.clearInterval(timer);
  }, [pathname, user]);

  useEffect(() => {
    if (navigator.doNotTrack === "1") return;
    const path = window.location.pathname;
    send("page_view", path);
    if (/^\/u\/[^/]+$/.test(path)) send("profile_viewed", path);
    if (/^\/u\/[^/]+\/[^/]+$/.test(path)) send("public_item_viewed", path);
  }, [pathname]);

  return null;
}
