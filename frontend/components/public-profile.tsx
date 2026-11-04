"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { ItemCard } from "@/components/items/item-card";

import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { Badge, Card } from "@/components/ui";
import type { ItemKind, PublicItem, PublicProfile } from "@/lib/types";

import styles from "./public-profile.module.css";

const ORDER: ItemKind[] = ["movie", "tv", "book", "game", "anime"];
const PAGE_LIMIT = 12;

const KIND_TABS: Record<ItemKind, "nav.movies" | "nav.series" | "nav.books" | "nav.games" | "nav.anime" | "nav.images" | "nav.other"> = {
  movie: "nav.movies",
  tv: "nav.series",
  book: "nav.books",
  game: "nav.games",
  anime: "nav.anime",
  image: "nav.images",
  other: "nav.other",
};

export function PublicProfileView({
  profile,
  items,
}: {
  profile: PublicProfile;
  items: PublicItem[];
}) {
  const { t, date } = useI18n();
  const { user } = useUser();
  const [followed, setFollowed] = useState(false);
  const [followers, setFollowers] = useState<number | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    if (!user || user.id === profile.id) return;
    let cancelled = false;
    api.follows
      .status(profile.id)
      .then((state) => {
        if (!cancelled) {
          setFollowed(state.following);
          setFollowers(state.followers);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile.id, user]);

  async function toggleFollow() {
    if (!user || user.id === profile.id) return;
    setFollowBusy(true);
    try {
      const state = followed
        ? await api.follows.unfollow(profile.id)
        : await api.follows.follow(profile.id);
      setFollowed(state.following);
      setFollowers(state.followers);
    } finally {
      setFollowBusy(false);
    }
  }
  const [active, setActive] = useState<ItemKind | "all">("all");
  const [expanded, setExpanded] = useState(false);

  const visibleItems = useMemo(
    () => items.filter((item) => ORDER.includes(item.kind)),
    [items],
  );

  const counts = useMemo(() => {
    const map = new Map<ItemKind, number>();
    for (const item of visibleItems) {
      map.set(item.kind, (map.get(item.kind) ?? 0) + 1);
    }
    return map;
  }, [visibleItems]);

  const kinds = ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0);
  const filtered =
    active === "all"
      ? visibleItems
      : visibleItems.filter((item) => item.kind === active);
  // The limit belongs to the "all" overview. A selected tab shows its own
  // records, otherwise the first 12 global records can hide most of a kind.
  const shown =
    active === "all" && !expanded
      ? filtered.slice(0, PAGE_LIMIT)
      : filtered;

  function onTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      ) ?? [],
    );
    const index = tabs.indexOf(event.currentTarget);

    let next = index;
    if (event.key === "ArrowRight") {
      next = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  const groups = kinds.map((kind) => ({
    kind,
    label: t(KIND_TABS[kind]),
    count: counts.get(kind) ?? 0,
    items: visibleItems.filter((item) => item.kind === kind),
  }));

  const shownGroups = groups
    .map((group) => ({
      ...group,
      items: shown.filter((item) => item.kind === group.kind),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className={styles.stack}>
      <section className={styles.profile}>
        <div
          aria-hidden="true"
          className={styles.banner}
          style={
            profile.banner_key
              ? { backgroundImage: `url(/media/${profile.banner_key})` }
              : undefined
          }
        />

        <div className={styles.identity}>
          {profile.avatar_key ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar
            <img
              className={styles.avatar}
              src={`/media/${profile.avatar_key}`}
              alt=""
              decoding="async"
            />
          ) : (
            <div className={styles.avatarPlaceholder} aria-hidden="true">
              {profile.display_name.trim().charAt(0).toUpperCase()}
            </div>
          )}

          <div className={styles.identityText}>
            <div className={styles.nameRow}>
              <h1 className={styles.name}>{profile.display_name}</h1>
              {user && user.id !== profile.id ? (
                <Button
                  loading={followBusy}
                  onClick={() => void toggleFollow()}
                  size="sm"
                  variant={followed ? "secondary" : "primary"}
                >
                  {followed ? t("public.following") : t("public.follow")}
                </Button>
              ) : null}
            </div>
            {followers !== null ? (
              <p className={styles.meta}>
                {t("public.followers", { count: followers })}
              </p>
            ) : null}
            <p className={styles.meta}>
              {visibleItems.length > 0
                ? t("public.records", { count: visibleItems.length })
                : t("public.none")}{" "}
              · {t("public.onSite", {
                date: date(profile.created_at, { dateStyle: "long" }),
              })}
            </p>

            {kinds.length > 0 ? (
              <ul className={styles.counts}>
                {groups.map((group) => (
                  <li key={group.kind}>
                    <Badge>
                      {group.label}: {group.count}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      <Card
        action={
          visibleItems.length > 0 ? (
            <span className={styles.total}>{visibleItems.length}</span>
          ) : null
        }
        title={t("public.items")}
      >
        {visibleItems.length === 0 ? (
          <p className={styles.empty}>{t("public.empty")}</p>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label={t("public.types")}>
              <button
                aria-selected={active === "all"}
                className={`${styles.tab} ${active === "all" ? styles.tabActive : ""}`}
                onClick={() => setActive("all")}
                onKeyDown={onTabKeyDown}
                role="tab"
                type="button"
              >
                {t("public.all")} ({visibleItems.length})
              </button>
              {groups.map((group) => (
                <button
                  aria-selected={active === group.kind}
                  className={`${styles.tab} ${active === group.kind ? styles.tabActive : ""}`}
                  key={group.kind}
                  onClick={() => setActive(group.kind)}
                  onKeyDown={onTabKeyDown}
                  role="tab"
                  type="button"
                >
                  {group.label} ({group.count})
                </button>
              ))}
            </div>

            {active === "all" ? (
              <div className={styles.groups}>
                {shownGroups.map((group) => (
                  <section className={styles.group} key={group.kind}>
                    <h2 className={styles.groupTitle}>{group.label}</h2>
                    <ItemGrid items={group.items} userId={profile.id} />
                  </section>
                ))}
              </div>
            ) : (
              <ItemGrid items={shown} userId={profile.id} />
            )}

            {active === "all" && visibleItems.length > PAGE_LIMIT ? (
              <button
                className={styles.more}
                onClick={() => setExpanded((value) => !value)}
                type="button"
              >
                {expanded
                  ? t("public.collapse")
                  : t("public.more", { count: visibleItems.length })}
              </button>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

function ItemGrid({ items, userId }: { items: PublicItem[]; userId: string }) {
  return (
    <ul className={styles.grid}>
      {items.map((item) => (
        <li key={item.id}>
          <ItemCard
            href={`/u/${userId}/${item.id}`}
            item={{ ...item, deleted_at: null }}
          />
        </li>
      ))}
    </ul>
  );
}
