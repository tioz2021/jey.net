"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

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
    window.addEventListener(SEEN_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SEEN_EVENT, refresh);
    };
  }, [loading, user]);

  if (count === 0) return null;

  return (
    <span className="feed-badge" aria-label={t("feed.new", { count })}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function markFeedSeen() {
  localStorage.setItem(SEEN_KEY, new Date().toISOString());
  window.dispatchEvent(new Event(SEEN_EVENT));
}
