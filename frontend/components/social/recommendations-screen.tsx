"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FeedTabs } from "@/components/feed-tabs";
import { HideRecommendation } from "@/components/hide-recommendation";
import { ItemCard } from "@/components/items/item-card";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { Card } from "@/components/ui";
import { AppLink } from "@/lib/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import {
  publicRecommendationKey,
  useHiddenRecommendations,
} from "@/lib/use-hidden-recommendations";
import type { CommunityRecommendation, FriendRecommendation } from "@/lib/types";

import styles from "./recommendations.module.css";

type Variant = "friends" | "community";

export function RecommendationsScreen({ variant = "friends" }: { variant?: Variant }) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<FriendRecommendation[]>([]);
  const [community, setCommunity] = useState<CommunityRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const { hidden, hide } = useHiddenRecommendations();

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.recommendations.friends(), api.recommendations.community()])
      .then(([friendResponse, communityResponse]) => {
        if (cancelled) return;
        setFriends(friendResponse.items);
        setCommunity(communityResponse.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleFriends = friends.filter(
    (item) => !hidden.has(publicRecommendationKey(item.author_id, item.id)),
  );
  const visibleCommunity = community.filter(
    (item) => !hidden.has(publicRecommendationKey(item.author_id, item.id)),
  );
  const isCommunity = variant === "community";

  return (
    <main>
      <FeedTabs />
      <p className="tabs-subtitle">
        {isCommunity ? t("recommendations.generalSubtitle") : t("recommendations.subtitle")}
      </p>
      <div className="section-toolbar">
        <ViewSwitch onChange={setView} value={view} />
      </div>

      {isCommunity ? (
        <Card title={t("recommendations.generalTitle")}>
          {!loading && visibleCommunity.length === 0 ? (
            <EmptyState
              actionHref="/people"
              actionLabel={t("recommendations.findPeople")}
              text={t("recommendations.communityEmptyText")}
              title={t("recommendations.communityEmptyTitle")}
            />
          ) : (
            <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
              {visibleCommunity.map((item) => (
                <li key={`${item.author_id}-${item.id}`}>
                  <div className={styles.reasonRow}>
                    <p className={styles.reason}>
                      {item.people.slice(0, 3).map((person, index) => (
                        <span key={`${person.handle}-${index}`}>
                          {index > 0 ? ", " : ""}
                          <AppLink href={`/u/${person.handle}`}>{person.name}</AppLink>
                        </span>
                      ))}
                      {item.people.length > 3 ? ` +${item.people.length - 3}` : ""}
                      {" · "}
                      {t("recommendations.communityMeta", {
                        count: item.people_count,
                        rating: item.average_rating,
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
          )}
          {!loading && visibleCommunity.length > 0 ? (
            <p className={styles.note}>
              <AppLink href="/people">{t("recommendations.findPeople")}</AppLink>
            </p>
          ) : null}
        </Card>
      ) : (
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
        </Card>
      )}
    </main>
  );
}
