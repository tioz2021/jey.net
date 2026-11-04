"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/items/item-card";
import { Badge, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type {
  FriendRecommendation,
  TasteGenre,
  TasteRecommendation,
} from "@/lib/types";

import styles from "./recommendations.module.css";

export default function RecommendationsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<FriendRecommendation[]>([]);
  const [tasteItems, setTasteItems] = useState<TasteRecommendation[]>([]);
  const [genres, setGenres] = useState<TasteGenre[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.recommendations.friends(),
      api.recommendations.taste(),
    ])
      .then(([friends, taste]) => {
        if (!cancelled) {
          setItems(friends.items);
          setTasteItems(taste.items);
          setGenres(taste.genres);
        }
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
      <PageHeader subtitle={t("recommendations.subtitle")} title={t("recommendations.title")} />
      <Card title={t("recommendations.tasteTitle")}>
        {genres.length === 0 ? (
          <p className={styles.empty}>{t("recommendations.tasteEmpty")}</p>
        ) : (
          <>
            <ul className={styles.genres}>
              {genres.map((genre) => (
                <li key={genre.name}>
                  <Badge>{genre.name}</Badge>
                </li>
              ))}
            </ul>
            {tasteItems.length > 0 ? (
              <ul className={styles.list}>
                {tasteItems.map((item) => (
                  <li key={`${item.author_id}-${item.id}`}>
                    <p className={styles.reason}>
                      {t("recommendations.tasteReason", {
                        genres: item.matched_genres.join(", "),
                      })}
                    </p>
                    <ItemCard
                      href={`/u/${item.author_id}/${item.id}`}
                      item={item}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>{t("recommendations.tasteNoItems")}</p>
            )}
          </>
        )}
      </Card>
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
