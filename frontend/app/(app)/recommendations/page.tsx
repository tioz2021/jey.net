"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/items/item-card";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { FriendRecommendation } from "@/lib/types";

import styles from "./recommendations.module.css";

export default function RecommendationsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<FriendRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.recommendations
      .friends()
      .then((response) => {
        if (!cancelled) setItems(response.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <PageHeader title={t("recommendations.title")} />
      <Card title={t("recommendations.friendsTitle")}>
        {!loading && items.length === 0 ? (
          <EmptyState
            text={t("recommendations.emptyText")}
            title={t("recommendations.emptyTitle")}
          />
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={`${item.author_id}-${item.id}`}>
                <p className={styles.reason}>
                  {t("recommendations.reason", {
                    friends: item.friends.slice(0, 3).join(", "),
                    rating: item.average_rating,
                  })}
                  {item.friend_count > 1 ? (
                    <span> · {item.friend_count}</span>
                  ) : null}
                </p>
                <ItemCard
                  href={`/u/${item.author_id}/${item.id}`}
                  item={item}
                />
              </li>
            ))}
          </ul>
        )}
        {!loading && items.length > 0 ? (
          <p className={styles.note}>
            <Link href="/feed">{t("recommendations.feedLink")}</Link>
          </p>
        ) : null}
      </Card>
    </main>
  );
}
