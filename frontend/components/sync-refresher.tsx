"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "@/lib/api";

const DEVICE_KEY = "jey-web-device";
const SEQ_KEY = "jey-web-sync-seq";

function deviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY, value);
  return value;
}

/**
 * Pulls the web shell forward when a desktop device changes the catalogue.
 * The web still writes directly to the server; this only discovers other
 * devices and refreshes Next's server-rendered data when something changed.
 */
export function SyncRefresher() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let device = "";

    async function prepare() {
      device = deviceId();
      try {
        await api.sync.registerDevice(device);
      } catch {
        // Registration can fail while the session is expiring; the next tick
        // will retry, and normal web navigation still works.
      }
    }

    async function poll() {
      if (cancelled || !device) return;
      const since = Number(window.localStorage.getItem(SEQ_KEY) ?? "0") || 0;
      try {
        const status = await api.sync.status(since, device);
        if (cancelled) return;
        if (status.last_seq > since) {
          window.localStorage.setItem(SEQ_KEY, String(status.last_seq));
          if (status.changes_after > 0) router.refresh();
        }
      } catch {
        // Offline or a stale session must not break the page.
      }
    }

    void prepare().then(() => {
      if (!cancelled) void poll();
    });
    const timer = window.setInterval(() => void poll(), 30_000);
    window.addEventListener("focus", poll);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [router]);

  return null;
}
