"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/items/item-card";
import { ListSkeleton } from "@/components/skeletons";
import { Button, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { describeError } from "@/lib/messages";
import { markFeedSeen } from "@/components/feed-badge";
import type { FeedItem } from "@/lib/types";

import styles from "./feed.module.css";

export default function FeedPage() {
  const i18n = useI18n();
  const { t } = i18n;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.feed
      .get()
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
  }, [reload, i18n]);

  return (
    <main>
      <PageHeader subtitle={t("feed.subtitle")} title={t("feed.title")} />
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
            text={t("feed.emptyText")}
            title={t("feed.emptyTitle")}
          />
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={`${item.author_id}-${item.id}`}>
                <p className={styles.author}>
                  <Link href={`/u/${item.author_id}`}>{item.author_name}</Link>
                </p>
                <ItemCard
                  href={`/u/${item.author_id}/${item.id}`}
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
