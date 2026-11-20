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
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import type { FeedItem, ItemKind } from "@/lib/types";

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.feed
      .get(kind, sort)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
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
  }, [reload, i18n, kind, sort]);

  return (
    <main>
      <FeedTabs />
      <p className="tabs-subtitle">{t("feed.subtitle")}</p>
      <div className="feed-kind-row">
        <FeedKindFilter onChange={setKind} value={kind} />
      </div>
      <div className="section-toolbar feed-controls">
        <ViewSwitch onChange={setView} value={view} />
        <FeedSort includePopular={false} onChange={setSort} value={sort} />
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
                  href={`/u/${item.author_handle}/cart/${item.slug}`}
                  item={item}
                  reactions
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
