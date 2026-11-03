"use client";

import { useMemo, useState } from "react";

import { ItemCard } from "@/components/items/item-card";

import { useI18n } from "@/lib/locale-context";
import { Badge, Card } from "@/components/ui";
import type { ItemKind, PublicItem, PublicProfile } from "@/lib/types";

import styles from "./public-profile.module.css";

const ORDER: ItemKind[] = ["movie", "tv", "book", "image", "other"];
const PAGE_LIMIT = 12;

const KIND_TABS: Record<ItemKind, "nav.movies" | "nav.series" | "nav.books" | "nav.images" | "nav.other"> = {
  movie: "nav.movies",
  tv: "nav.series",
  book: "nav.books",
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
  const [active, setActive] = useState<ItemKind | "all">("all");
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<ItemKind, number>();
    for (const item of items) {
      map.set(item.kind, (map.get(item.kind) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const kinds = ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0);
  const shown = expanded ? items : items.slice(0, PAGE_LIMIT);
  const visible =
    active === "all" ? shown : shown.filter((item) => item.kind === active);

  const groups = kinds
    .map((kind) => ({
      kind,
      label: t(KIND_TABS[kind]),
      count: counts.get(kind) ?? 0,
      items: shown.filter((item) => item.kind === kind),
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
            <h1 className={styles.name}>{profile.display_name}</h1>
            <p className={styles.meta}>
              {items.length > 0
                ? t("public.records", { count: items.length })
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
          items.length > 0 ? <span className={styles.total}>{items.length}</span> : null
        }
        title={t("public.items")}
      >
        {items.length === 0 ? (
          <p className={styles.empty}>{t("public.empty")}</p>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label={t("public.types")}>
              <button
                aria-selected={active === "all"}
                className={`${styles.tab} ${active === "all" ? styles.tabActive : ""}`}
                onClick={() => setActive("all")}
                role="tab"
                type="button"
              >
                {t("public.all")} ({items.length})
              </button>
              {groups.map((group) => (
                <button
                  aria-selected={active === group.kind}
                  className={`${styles.tab} ${active === group.kind ? styles.tabActive : ""}`}
                  key={group.kind}
                  onClick={() => setActive(group.kind)}
                  role="tab"
                  type="button"
                >
                  {group.label} ({group.count})
                </button>
              ))}
            </div>

            {active === "all" ? (
              <div className={styles.groups}>
                {groups.map((group) => (
                  <section className={styles.group} key={group.kind}>
                    <h2 className={styles.groupTitle}>{group.label}</h2>
                    <ItemGrid items={group.items} userId={profile.id} />
                  </section>
                ))}
              </div>
            ) : (
              <ItemGrid items={visible} userId={profile.id} />
            )}

            {items.length > PAGE_LIMIT ? (
              <button
                className={styles.more}
                onClick={() => setExpanded((value) => !value)}
                type="button"
              >
                {expanded
                  ? t("public.collapse")
                  : t("public.more", { count: items.length })}
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
