"use client";

import { AppLink } from "@/lib/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { HideRecommendation } from "@/components/hide-recommendation";
import { FeedTabs } from "@/components/feed-tabs";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { ItemCard } from "@/components/items/item-card";
import { Badge, Card } from "@/components/ui";
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

export function RecommendationsScreen({ variant = "friends" }: { variant?: "friends" | "taste" }) {
  const { t } = useI18n();
  const [items, setItems] = useState<FriendRecommendation[]>([]);
  const [tasteItems, setTasteItems] = useState<TasteRecommendation[]>([]);
  const [genres, setGenres] = useState<TasteGenre[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
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
  const showTaste = variant === "taste";
  const showFriends = variant === "friends";

  return (
    <main>
      <FeedTabs />
      <p className="tabs-subtitle">
        {showTaste
          ? t("recommendations.generalSubtitle")
          : t("recommendations.subtitle")}
      </p>
      <div className="section-toolbar">
        <ViewSwitch onChange={setView} value={view} />
      </div>
      {showTaste ? (
      <Card title={showTaste ? t("recommendations.generalTitle") : t("recommendations.tasteTitle")}>
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
              <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
                {visibleTaste.map((item) => (
                  <li key={`${item.author_id}-${item.id}`}>
                    <div className={styles.reasonRow}>
                      <p className={styles.reason}>
                        <AppLink href={`/u/${item.author_handle}`}>{item.author_name}</AppLink>
                        {" — "}
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
      ) : null}
      {showFriends ? (
      <Card title={t("recommendations.friendsTitle")}>
        {!loading && visibleFriends.length === 0 ? (
          <EmptyState
            actionHref="/people"
            actionLabel={t("recommendations.findPeople")}
            text={t("recommendations.emptyText")}
            title={t("recommendations.emptyTitle")}
          />
        ) : (
          <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
            {visibleFriends.map((item) => (
              <li key={`${item.author_id}-${item.id}`}>
                <div className={styles.reasonRow}>
                  <p className={styles.reason}>
                    {(item.friend_people ?? item.friends.map((name) => ({ name, handle: item.author_handle })))
                      .slice(0, 3)
                      .map((person, index) => (
                        <span key={`${person.handle}-${index}`}>
                          {index > 0 ? ", " : ""}
                          <AppLink href={`/u/${person.handle}`}>{person.name}</AppLink>
                        </span>
                      ))}
                    {" "}
                    {t("recommendations.rated", { rating: item.average_rating })}
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
      </Card>      ) : null}

    </main>
  );
}
