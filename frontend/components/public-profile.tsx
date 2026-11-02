"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge, Card } from "@/components/ui";
import { KIND_LABELS } from "@/lib/labels";
import type { ItemKind, PublicItem, PublicProfile } from "@/lib/types";

import styles from "./public-profile.module.css";

const ORDER: ItemKind[] = ["movie", "book", "image", "other"];
const PAGE_LIMIT = 12;

const KIND_PLURALS: Record<ItemKind, string> = {
  movie: "Фильмы",
  book: "Книги",
  image: "Картинки",
  other: "Другое",
};

export function PublicProfileView({
  profile,
  items,
}: {
  profile: PublicProfile;
  items: PublicItem[];
}) {
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
      label: KIND_PLURALS[kind],
      count: counts.get(kind) ?? 0,
      items: shown.filter((item) => item.kind === kind),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className={styles.stack}>
      <Card>
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
                ? `Завершённых записей: ${items.length}`
                : "Пока нет завершённых записей"}{" "}
              · на сайте с {new Date(profile.created_at).toLocaleDateString("ru-RU", { dateStyle: "long" })}
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
      </Card>

      <Card
        action={
          items.length > 0 ? <span className={styles.total}>{items.length}</span> : null
        }
        title="Записи"
      >
        {items.length === 0 ? (
          <p className={styles.empty}>Пользователь пока не добавил завершённых записей.</p>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Типы записей">
              <button
                aria-selected={active === "all"}
                className={`${styles.tab} ${active === "all" ? styles.tabActive : ""}`}
                onClick={() => setActive("all")}
                role="tab"
                type="button"
              >
                Все ({items.length})
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
                {expanded ? "Свернуть" : `Показать все (${items.length})`}
              </button>
            ) : null}
          </>
        )}
      </Card>

      <p className={styles.note}>
        Здесь — завершённые записи с оценками и заметками автора. Черновики и
        планы скрыты.
      </p>
    </div>
  );
}

function ItemGrid({ items, userId }: { items: PublicItem[]; userId: string }) {
  return (
    <ul className={styles.grid}>
      {items.map((item) => (
        <li key={item.id}>
          <Link className={styles.card} href={`/u/${userId}/${item.id}`}>
          {item.cover_key ? (
            // eslint-disable-next-line @next/next/no-img-element -- WebP rendition
            <img
              className={styles.cover}
              src={`/media/${item.cover_key}`}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className={styles.coverPlaceholder} aria-hidden="true" />
          )}

          <div className={styles.cardBody}>
            <p className={styles.kind}>{KIND_LABELS[item.kind]}</p>
            <h3 className={styles.title}>{item.title}</h3>
            {item.subtitle ? <p className={styles.subtitle}>{item.subtitle}</p> : null}
            <p className={styles.cardMeta}>
              {[item.year, item.rating ? `★ ${item.rating}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {item.tags.length > 0 ? (
              <ul className={styles.tags}>
                {item.tags.map((tag) => (
                  <li key={tag}>
                    <Badge>{tag}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
