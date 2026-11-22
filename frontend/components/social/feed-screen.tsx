"use client";

import { AppLink } from "@/lib/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/items/item-card";
import { ListSkeleton } from "@/components/skeletons";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { describeError } from "@/lib/messages";
import { feedSeenCutoff, markFeedSeen } from "@/components/feed-badge";
import { FeedTabs } from "@/components/feed-tabs";
import { FeedKindFilter } from "@/components/social/feed-kind-filter";
import { FeedSort, type FeedSortValue } from "@/components/social/feed-sort";
import { FeedPeriod, type FeedPeriodValue } from "@/components/social/feed-period";
import { FeedItemActions } from "@/components/social/feed-item-actions";
import { FeedCardHeader } from "@/components/social/feed-card-header";
import { FeedLoadMore } from "@/components/feed-load-more";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { readViewPreference, saveViewPreference } from "@/lib/view-preference";
import { useFeedUrl } from "@/lib/use-feed-url";
import type { FeedItem, FeedKindCounts, ItemKind } from "@/lib/types";

import styles from "./feed.module.css";

export function FeedScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<ViewMode>(() =>
    readViewPreference("jey:view:feed", "grid"),
  );

  function changeView(value: ViewMode) {
    setView(value);
    saveViewPreference("jey:view:feed", value);
  }
  const [filters, setFilters] = useFeedUrl("new");
  const kind = filters.kind;
  const sort = filters.sort;
  const period = filters.period;
  const [counts, setCounts] = useState<FeedKindCounts>({});
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newSince, setNewSince] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const firstLoad = !loadedOnce.current;
    setLoading(firstLoad);
    setRefreshing(!firstLoad);
    setError(null);
    setNextOffset(null);
    if (firstLoad) setItems([]);
    setNewSince(feedSeenCutoff());
    api.feed
      .get(kind, sort, period, 0)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setCounts(response.counts ?? {});
          setNextOffset(response.next_offset);
          markFeedSeen();
        }
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
  }, [reload, i18n, kind, sort, period]);

  async function loadMore() {
    if (nextOffset === null || loadingMore || refreshing) return;
    setLoadingMore(true);
    try {
      const response = await api.feed.get(kind, sort, period, nextOffset);
      setItems((current) => [...current, ...response.items]);
      setCounts(response.counts ?? {});
      setNextOffset(response.next_offset);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const refresh = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (loading || refreshing || loadingMore) return;
      try {
        const response = await api.feed.get(kind, sort, period, 0);
        if (cancelled) return;
        setItems(response.items);
        setCounts(response.counts ?? {});
        setNextOffset(response.next_offset);
      } catch {
        // Keep the current feed; the next focus/poll retries.
      }
    };

    const schedule = () => {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refresh().finally(schedule);
      }, document.visibilityState === "visible" ? 30_000 : 120_000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh().finally(schedule);
      } else {
        schedule();
      }
    };

    schedule();
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [kind, sort, period, loading, refreshing, loadingMore]);

  const newItemsCount = newSince
    ? items.filter((item) => new Date(item.updated_at).getTime() > newSince).length
    : 0;
  const showNewDivider =
    sort === "new" && newSince > 0 && newItemsCount > 0 && newItemsCount < items.length;

  return (
    <main>
      <FeedTabs />
      <p className="tabs-subtitle">{t("feed.subtitle")}</p>
      <div className="feed-kind-row">
        <FeedKindFilter counts={counts} onChange={(value) => setFilters({ kind: value })} value={kind} />
      </div>
      <div className="section-toolbar feed-controls">
        <ViewSwitch onChange={changeView} value={view} />
        <FeedSort includePopular={false} onChange={(value) => setFilters({ sort: value })} value={sort} />
        <FeedPeriod onChange={(value) => setFilters({ period: value })} value={period} />
        {refreshing ? <span aria-live="polite" className="feed-updating">{t("feed.updating")}</span> : null}
      </div>
      <Card>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <EmptyState
            action={
              <Button
                variant="secondary"
                onClick={() => setReload((value) => value + 1)}
              >
                {t("items.retry")}
              </Button>
            }
            text={error}
            title={t("items.errorTitle")}
          />
        ) : items.length === 0 ? (
          <EmptyState
            text={kind ? t("feed.kindEmpty") : t("feed.emptyText")}
            title={kind ? t("feed.kindEmptyTitle") : t("feed.emptyTitle")}
          />
        ) : (
          <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
            {items.map((item, index) => (
              <Fragment key={`${item.author_id}-${item.id}`}>
                {showNewDivider && index === newItemsCount ? (
                  <li className={styles.newDivider}>
                    <span>{t("feed.newSince")}</span>
                  </li>
                ) : null}
              <li>
                <ItemCard
                  header={
                    <FeedCardHeader
                      actions={<FeedItemActions item={item} />}
                      avatars={[{ name: item.author_name }]}
                    >
                      <AppLink href={`/u/${item.author_handle}`}>{item.author_name}</AppLink>
                    </FeedCardHeader>
                  }
                  hideStatus
                  href={`/u/${item.author_handle}/cart/${item.slug}`}
                  item={item}
                />
              </li>
              </Fragment>
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
