/* eslint-disable @next/next/no-img-element -- covers are ready-made WebP renditions */
import Link from "next/link";

import { Badge } from "@/components/ui";
import { KIND_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import {
  localizedSubtitle,
  localizedTags,
  localizedTitle,
} from "@/lib/item-title";
import { RatingStars } from "@/components/items/rating-stars";
import { useI18n } from "@/lib/locale-context";
import { STATUS_TONES } from "@/lib/labels";
import type { ItemKind, ItemStatus } from "@/lib/types";

import { RestoreButton } from "./restore-button";
import styles from "./item-card.module.css";

/** Marks the part of the title that matched the search. */
function Highlight({ text, query }: { text: string; query?: string }) {
  const needle = query?.trim().toLowerCase() ?? "";
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;

  if (!needle || index === -1) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark className={styles.mark}>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

/** Fields a card needs; `Item` satisfies this too. */
export interface ItemCardData {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle: string | null;
  year: number | null;
  status: ItemStatus;
  rating: number | null;
  review: string | null;
  cover_key: string | null;
  tags: string[];
  deleted_at?: string | null;
  details?: {
    genres?: string[] | null;
    translations?: Record<
      string,
      {
        title?: string | null;
        director?: string | null;
        genres?: string[] | null;
      }
    > | null;
  } | null;
  titles?: Record<string, string> | null;
  directors?: Record<string, string> | null;
  genres?: Record<string, string[]> | null;
}

export function ItemCard({
  item,
  query,
  href,
}: {
  item: ItemCardData;
  query?: string;
  href?: string;
}) {
  const target = href ?? `/items/${item.id}`;
  const { t, locale } = useI18n();
  const title = localizedTitle(item, locale);
  const subtitle = localizedSubtitle(item, locale);
  const tags = localizedTags(item, locale);
  const meta = [
    t(KIND_KEYS[item.kind]),
    item.year ? String(item.year) : null,
  ].filter(Boolean);

  return (
    <article className={styles.card}>
      <div className={styles.poster}>
        {item.cover_key ? (
          <img
            className={styles.cover}
            src={`/media/${item.cover_key}`}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {item.deleted_at ? (
              title
            ) : (
              <Link className={styles.link} href={target}>
                <Highlight text={title} query={query} />
              </Link>
            )}
          </h2>
          <Badge tone={STATUS_TONES[item.status]}>
            {t(STATUS_KEYS[item.status])}
          </Badge>
        </div>

        {subtitle ? (
          <p className={styles.subtitle}>{subtitle}</p>
        ) : null}

        <p className={styles.meta}>{meta.join(" · ")}</p>

        {item.rating ? (
          <div className={styles.rating}>
            <RatingStars
              compact
              label={t("item.ratingOf", { rating: item.rating })}
              value={item.rating}
            />
          </div>
        ) : null}

        {item.review ? <p className={styles.review}>{item.review}</p> : null}

        {item.deleted_at ? (
          <div className={styles.deleted}>
            <Badge tone="danger">{t("card.deleted")}</Badge>
            <RestoreButton itemId={item.id} />
          </div>
        ) : null}

        {tags.length > 0 ? (
          <ul className={styles.tags}>
            {tags.map((tag) => (
              <li key={tag}>
                <Badge>{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
