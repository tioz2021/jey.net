"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { FeedTabs } from "@/components/feed-tabs";
import { FeedKindFilter } from "@/components/social/feed-kind-filter";
import { FeedSort, type FeedSortValue } from "@/components/social/feed-sort";
import { FeedPeriod, type FeedPeriodValue } from "@/components/social/feed-period";
import { FeedItemActions } from "@/components/social/feed-item-actions";
import { RecommendationReviews } from "@/components/social/recommendation-reviews";
import { FeedCardHeader } from "@/components/social/feed-card-header";
import { FeedLoadMore } from "@/components/feed-load-more";
import { ItemCard } from "@/components/items/item-card";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { readViewPreference, saveViewPreference } from "@/lib/view-preference";
import { Card } from "@/components/ui";
import { AppLink } from "@/lib/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import {
  publicRecommendationKey,
  useHiddenRecommendations,
} from "@/lib/use-hidden-recommendations";
import type { CommunityRecommendation, FeedKindCounts, FriendRecommendation, ItemKind } from "@/lib/types";

import styles from "./recommendations.module.css";

type Variant = "friends" | "community";

export function RecommendationsScreen({ variant = "friends" }: { variant?: Variant }) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<FriendRecommendation[]>([]);
  const [community, setCommunity] = useState<CommunityRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>(() =>
    readViewPreference("jey:view:feed", "list"),
  );

  function changeView(value: ViewMode) {
    setView(value);
    saveViewPreference("jey:view:feed", value);
  }
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [sort, setSort] = useState<FeedSortValue>("rating");
  const [period, setPeriod] = useState<FeedPeriodValue>("all");
  const [counts, setCounts] = useState<FeedKindCounts>({});
  const [nextFriends, setNextFriends] = useState<number | null>(null);
  const [nextCommunity, setNextCommunity] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { hidden, hide } = useHiddenRecommendations();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFriends([]);
    setCommunity([]);
    setNextFriends(null);
    setNextCommunity(null);
    Promise.all([
      api.recommendations.friends(kind, sort, period, 0),
      api.recommendations.community(kind, sort, period, 0),
    ])
      .then(([friendResponse, communityResponse]) => {
        if (cancelled) return;
        setFriends(friendResponse.items);
        setCommunity(communityResponse.items);
        setNextFriends(friendResponse.next_offset);
        setNextCommunity(communityResponse.next_offset);
        setCounts(
          variant === "community" ? communityResponse.counts : friendResponse.counts,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, sort, period, variant]);

  const visibleFriends = friends.filter(
    (item) => !hidden.has(publicRecommendationKey(item.author_id, item.id)),
  );
  const visibleCommunity = community.filter(
    (item) => !hidden.has(publicRecommendationKey(item.author_id, item.id)),
  );
  const isCommunity = variant === "community";

  async function hideRecommendation(item: FriendRecommendation | CommunityRecommendation) {
    try {
      await api.recommendations.hide(item.author_id, item.id);
    } catch {
      // Keep the local hide even if the network is unavailable.
    }
    hide(publicRecommendationKey(item.author_id, item.id));
  }

  async function loadMore() {
    const next = isCommunity ? nextCommunity : nextFriends;
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    try {
      if (isCommunity) {
        const response = await api.recommendations.community(kind, sort, period, next);
        setCommunity((current) => [...current, ...response.items]);
        setCounts(response.counts ?? {});
        setNextCommunity(response.next_offset);
      } else {
        const response = await api.recommendations.friends(kind, sort, period, next);
        setFriends((current) => [...current, ...response.items]);
        setCounts(response.counts ?? {});
        setNextFriends(response.next_offset);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main>
      <FeedTabs />
      <p className="tabs-subtitle">
        {isCommunity ? t("recommendations.generalSubtitle") : t("recommendations.subtitle")}
      </p>
      <div className="feed-kind-row">
        <FeedKindFilter counts={counts} onChange={setKind} value={kind} />
      </div>
      <div className="section-toolbar feed-controls">
        <ViewSwitch onChange={changeView} value={view} />
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
                  <ItemCard
                    header={
                      <FeedCardHeader
                        actions={
                          <FeedItemActions
                            item={item}
                            onHide={() => void hideRecommendation(item)}
                          />
                        }
                        avatars={item.people}
                        score={item.people_count > 1 ? `${item.average_rating}/10` : undefined}
                      >
                        {item.people.slice(0, 3).map((person, index) => (
                          <span key={`${person.handle}-${index}`}>
                            {index > 0 ? ", " : ""}
                            <AppLink href={`/u/${person.handle}`}>{person.name}</AppLink>
                          </span>
                        ))}
                        {item.people.length > 3 ? ` +${item.people.length - 3}` : ""}
                        {item.people_count > 1 ? (
                          <>
                            {" · "}
                            {t("recommendations.communityMeta", {
                              count: item.people_count,
                              rating: item.average_rating,
                            })}
                          </>
                        ) : null}
                      </FeedCardHeader>
                    }
                    hideActionDate
                    hideStatus
                    href={`/u/${item.author_handle}/cart/${item.slug}`}
                    item={item}
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
          <FeedLoadMore
            hasMore={nextCommunity !== null}
            loading={loadingMore}
            onLoad={() => void loadMore()}
          />
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
                  <ItemCard
                    header={
                      <FeedCardHeader
                        actions={
                          <FeedItemActions
                            item={item}
                            onHide={() => void hideRecommendation(item)}
                          />
                        }
                        avatars={item.friend_people ?? item.friends.map((name) => ({ name, handle: item.author_handle }))}
                        score={item.friend_count > 1 ? `${item.average_rating}/10` : undefined}
                      >
                        {(item.friend_people ?? item.friends.map((name) => ({ name, handle: item.author_handle })))
                          .slice(0, 3)
                          .map((person, index) => (
                            <span key={`${person.handle}-${index}`}>
                              {index > 0 ? ", " : ""}
                              <AppLink href={`/u/${person.handle}`}>{person.name}</AppLink>
                            </span>
                          ))}
                        {item.friend_count > 1
                          ? ` · ${t("recommendations.friendsCount", { count: item.friend_count })}`
                          : ""}
                      </FeedCardHeader>
                    }
                    extras={
                      item.reviews?.length ? <RecommendationReviews reviews={item.reviews} /> : undefined
                    }
                    hideActionDate
                    hideRating={item.friend_count > 1}
                    hideReview
                    hideStatus
                    href={`/u/${item.author_handle}/cart/${item.slug}`}
                    item={item}
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
          <FeedLoadMore
            hasMore={nextFriends !== null}
            loading={loadingMore}
            onLoad={() => void loadMore()}
          />
        </Card>
      )}
    </main>
  );
}
