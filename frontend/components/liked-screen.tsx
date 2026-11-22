"use client";

import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FeedCardHeader } from "@/components/social/feed-card-header";
import { FeedItemActions } from "@/components/social/feed-item-actions";
import { FeedLoadMore } from "@/components/feed-load-more";
import { FeedKindFilter } from "@/components/social/feed-kind-filter";
import { ItemCard } from "@/components/items/item-card";
import { ListSkeleton } from "@/components/skeletons";
import { NotebookTabs } from "@/components/notebook-tabs";
import { Button, Card } from "@/components/ui";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { AppLink } from "@/lib/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { readViewPreference, saveViewPreference } from "@/lib/view-preference";
import { useFeedUrl } from "@/lib/use-feed-url";
import { describeError } from "@/lib/messages";
import type { ItemKind, LikedItem } from "@/lib/types";

import styles from "./social/feed.module.css";

export function LikedScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const [items, setItems] = useState<LikedItem[]>([]);
  const [filters, setFilters] = useFeedUrl("rating");
  const kind = filters.kind;
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<ViewMode>(() =>
    readViewPreference("jey:view:liked", "list"),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const firstLoad = !loadedOnce.current;
    setLoading(firstLoad);
    setRefreshing(!firstLoad);
    setError(null);
    if (firstLoad) setItems([]);
    setNextOffset(null);
    api.liked
      .list(kind, 0)
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setNextOffset(response.next_offset);
      })
      .catch((cause) => {
        if (!cancelled) setError(describeError(cause, i18n).text);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
          loadedOnce.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, reload, i18n]);

  function changeView(value: ViewMode) {
    setView(value);
    saveViewPreference("jey:view:liked", value);
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore || refreshing) return;
    setLoadingMore(true);
    try {
      const response = await api.liked.list(kind, nextOffset);
      setItems((current) => [...current, ...response.items]);
      setNextOffset(response.next_offset);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main>
      <NotebookTabs />
      <p className="tabs-subtitle">{t("liked.subtitle")}</p>
      <div className="feed-kind-row">
        <FeedKindFilter onChange={(value) => setFilters({ kind: value })} value={kind} />
      </div>
      <div className="section-toolbar feed-controls">
        <ViewSwitch onChange={changeView} value={view} />
        {refreshing ? <span aria-live="polite" className="feed-updating">{t("feed.updating")}</span> : null}
      </div>
      <Card>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <EmptyState
            action={<Button onClick={() => setReload((value) => value + 1)} variant="secondary">{t("items.retry")}</Button>}
            text={error}
            title={t("items.errorTitle")}
          />
        ) : items.length === 0 ? (
          <EmptyState
            text={kind ? t("recommendations.kindEmpty") : t("liked.emptyText")}
            title={kind ? t("feed.kindEmptyTitle") : t("liked.emptyTitle")}
          />
        ) : (
          <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard
                  header={
                    <FeedCardHeader
                      actions={<FeedItemActions item={item} showLike={false} />}
                      avatars={[{ name: item.author_name }]}
                    >
                      <AppLink href={`/u/${item.author_handle}`}>{item.author_name}</AppLink>
                    </FeedCardHeader>
                  }
                  href={`/u/${item.author_handle}/cart/${item.slug}`}
                  item={item}
                />
              </li>
            ))}
          </ul>
        )}
        <FeedLoadMore
          hasMore={nextOffset !== null && !refreshing}
          loading={loadingMore}
          onLoad={() => void loadMore()}
        />
      </Card>
    </main>
  );
}
