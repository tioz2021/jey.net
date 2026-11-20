"use client";

import { AppLink } from "@/lib/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/items/item-card";
import { ListSkeleton } from "@/components/skeletons";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { describeError } from "@/lib/messages";
import { markFeedSeen } from "@/components/feed-badge";
import { FeedTabs } from "@/components/feed-tabs";
import { FeedKindFilter } from "@/components/social/feed-kind-filter";
import { FeedSort, type FeedSortValue } from "@/components/social/feed-sort";
import { FeedPeriod, type FeedPeriodValue } from "@/components/social/feed-period";
import { FeedItemActions } from "@/components/social/feed-item-actions";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import type { FeedItem, FeedKindCounts, ItemKind } from "@/lib/types";

import styles from "./feed.module.css";

export function FeedScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<ViewMode>("grid");
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [sort, setSort] = useState<FeedSortValue>("new");
  const [period, setPeriod] = useState<FeedPeriodValue>("all");
  const [counts, setCounts] = useState<FeedKindCounts>({});
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNextOffset(null);
    setItems([]);
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, i18n, kind, sort, period]);

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
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

  return (
    <main>
      <FeedTabs />
      <p className="tabs-subtitle">{t("feed.subtitle")}</p>
      <div className="feed-kind-row">
        <FeedKindFilter counts={counts} onChange={setKind} value={kind} />
      </div>
      <div className="section-toolbar feed-controls">
        <ViewSwitch onChange={setView} value={view} />
        <FeedSort includePopular={false} onChange={setSort} value={sort} />
        <FeedPeriod onChange={setPeriod} value={period} />
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
            {items.map((item) => (
              <li key={`${item.author_id}-${item.id}`}>
                <p className={styles.author}>
                  <AppLink href={`/u/${item.author_id}`}>{item.author_name}</AppLink>
                </p>
                <ItemCard
                  footer={<FeedItemActions item={item} />}
                  href={`/u/${item.author_handle}/cart/${item.slug}`}
                  item={item}
                  reactions
                />
              </li>
            ))}
          </ul>
        )}
        {nextOffset !== null ? (
          <div className="feed-load-more">
            <Button loading={loadingMore} onClick={() => void loadMore()} size="sm" variant="secondary">
              {t("feed.loadMore")}
            </Button>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
