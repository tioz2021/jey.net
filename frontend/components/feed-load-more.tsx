"use client";

import { useEffect, useRef } from "react";

import { useI18n } from "@/lib/locale-context";

/** Invisible sentinel that loads the next page when scrolled into view. */
export function FeedLoadMore({
  hasMore,
  loading,
  onLoad,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoad();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoad]);

  if (!hasMore) return null;

  return (
    <div aria-live="polite" className="feed-load-more" ref={ref}>
      {loading ? <span className="feed-loading">{t("feed.loadingMore")}</span> : null}
    </div>
  );
}
