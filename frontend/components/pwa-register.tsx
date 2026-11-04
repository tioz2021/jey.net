"use client";

import { useEffect } from "react";

/** Registers the offline shell only in production builds. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app works without a service worker; never block the page.
    });
  }, []);

  return null;
}
