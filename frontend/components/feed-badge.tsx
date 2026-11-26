"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import { subscribeToNotifications } from "@/lib/notification-stream";

const IS_DESKTOP = typeof window !== "undefined" && "__TAURI__" in window;

const SEEN_KEY = "jey.feed-seen";
const SEEN_EVENT = "jey:feed-seen";

/** Unread public records of followed profiles, compared with the last feed visit. */
export function FeedBadge() {
  const { user, loading } = useUser();
  const { t } = useI18n();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;

    const refresh = () => {
      api.feed
        .get()
        .then((response) => {
          if (cancelled) return;
          const seen = localStorage.getItem(SEEN_KEY);
          const cutoff = seen ? new Date(seen).getTime() : 0;
          const unread = response.items.filter(
            (item) => new Date(item.updated_at).getTime() > cutoff,
          ).length;
          setCount(unread);
        })
        .catch(() => setCount(0));
    };

    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 5_000);
    // Web gets an instant update from the shared notification SSE. Desktop
    // has no EventSource bridge, so its shorter interval is the fallback.
    const unsubscribe = IS_DESKTOP ? () => {} : subscribeToNotifications(refresh);
    window.addEventListener(SEEN_EVENT, refresh);
    window.addEventListener("jey:notification", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener(SEEN_EVENT, refresh);
      window.removeEventListener("jey:notification", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loading, user]);

  if (count === 0) return null;

  return (
    <span className="feed-badge" aria-label={t("feed.new", { count })}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function feedSeenCutoff(): number {
  const seen = localStorage.getItem(SEEN_KEY);
  if (!seen) return 0;
  const value = new Date(seen).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function markFeedSeen(uptoTimestamp?: number) {
  // Use the newest server timestamp from the loaded page, not the client
  // clock: a small clock skew used to leave every fetched card "unread".
  const cutoff = uptoTimestamp && Number.isFinite(uptoTimestamp) ? uptoTimestamp : Date.now();
  localStorage.setItem(SEEN_KEY, new Date(cutoff).toISOString());
  window.dispatchEvent(new Event(SEEN_EVENT));
}
