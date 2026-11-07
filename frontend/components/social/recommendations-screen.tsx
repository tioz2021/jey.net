"use client";

import { AppLink } from "@/lib/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { HideRecommendation } from "@/components/hide-recommendation";
import { ItemCard } from "@/components/items/item-card";
import { Badge, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import {
  publicRecommendationKey,
  useHiddenRecommendations,
} from "@/lib/use-hidden-recommendations";
import type {
  FriendRecommendation,
  TasteGenre,
  TasteRecommendation,
} from "@/lib/types";

import styles from "./recommendations.module.css";

export function RecommendationsScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<FriendRecommendation[]>([]);
  const [tasteItems, setTasteItems] = useState<TasteRecommendation[]>([]);
  const [genres, setGenres] = useState<TasteGenre[]>([]);
  const [loading, setLoading] = useState(true);
  const { hidden, hide } = useHiddenRecommendations();

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

  const visibleTaste = tasteItems.filter(
    (item) => !hidden.has(publicRecommendationKey(item.author_id, item.id)),
  );
  const visibleFriends = items.filter(
    (item) => !hidden.has(publicRecommendationKey(item.author_id, item.id)),
  );

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
            {visibleTaste.length > 0 ? (
              <ul className={styles.list}>
                {visibleTaste.map((item) => (
                  <li key={`${item.author_id}-${item.id}`}>
                    <div className={styles.reasonRow}>
                      <p className={styles.reason}>
                        {t("recommendations.tasteReason", {
                          genres: item.matched_genres.join(", "),
                        })}
                      </p>
                      <HideRecommendation
                        onHide={() => hide(publicRecommendationKey(item.author_id, item.id))}
                      />
                    </div>
                    <ItemCard
                      href={`/u/${item.author_handle}/cart/${item.slug}`}
                      item={item}
                      reactions
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
        {!loading && visibleFriends.length === 0 ? (
          <EmptyState
            actionHref="/people"
            actionLabel={t("recommendations.findPeople")}
            text={t("recommendations.emptyText")}
            title={t("recommendations.emptyTitle")}
          />
        ) : (
          <ul className={styles.list}>
            {visibleFriends.map((item) => (
              <li key={`${item.author_id}-${item.id}`}>
                <div className={styles.reasonRow}>
                  <p className={styles.reason}>
                    {t("recommendations.reason", {
                      friends: item.friends.slice(0, 3).join(", "),
                      rating: item.average_rating,
                    })}
                    {item.friend_count > 1 ? (
                      <span> · {item.friend_count}</span>
                    ) : null}
                  </p>
                  <HideRecommendation
                    onHide={() => hide(publicRecommendationKey(item.author_id, item.id))}
                  />
                </div>
                <ItemCard
                  href={`/u/${item.author_handle}/cart/${item.slug}`}
                  item={item}
                  reactions
                />
              </li>
            ))}
          </ul>
        )}
        {!loading && visibleFriends.length > 0 ? (
          <p className={styles.note}>
            <AppLink href="/feed">{t("recommendations.feedLink")}</AppLink>
          </p>
        ) : null}
      </Card>
    </main>
  );
}
