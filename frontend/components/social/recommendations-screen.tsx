"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FeedTabs } from "@/components/feed-tabs";
import { FeedKindFilter } from "@/components/social/feed-kind-filter";
import { FeedSort, type FeedSortValue } from "@/components/social/feed-sort";
import { FeedPeriod, type FeedPeriodValue } from "@/components/social/feed-period";
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
import type { CommunityRecommendation, FriendRecommendation, ItemKind } from "@/lib/types";

import styles from "./recommendations.module.css";

type Variant = "friends" | "community";

export function RecommendationsScreen({ variant = "friends" }: { variant?: Variant }) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<FriendRecommendation[]>([]);
  const [community, setCommunity] = useState<CommunityRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [sort, setSort] = useState<FeedSortValue>("rating");
  const [period, setPeriod] = useState<FeedPeriodValue>("all");
  const { hidden, hide } = useHiddenRecommendations();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.recommendations.friends(kind, sort, period),
      api.recommendations.community(kind, sort, period),
    ])
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
  }, [kind, sort, period]);

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
      <div className="feed-kind-row">
        <FeedKindFilter onChange={setKind} value={kind} />
      </div>
      <div className="section-toolbar feed-controls">
        <ViewSwitch onChange={setView} value={view} />
        <FeedSort onChange={setSort} value={sort} />
        <FeedPeriod onChange={setPeriod} value={period} />
      </div>

      {isCommunity ? (
        <Card title={t("recommendations.generalTitle")}>
          {!loading && visibleCommunity.length === 0 ? (
            <EmptyState
              actionHref="/people"
              actionLabel={t("recommendations.findPeople")}
              text={kind ? t("recommendations.kindEmpty") : t("recommendations.communityEmptyText")}
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
              text={kind ? t("recommendations.kindEmpty") : t("recommendations.emptyText")}
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
