/* eslint-disable @next/next/no-img-element -- covers are already WebP renditions served by our API */
import Link from "next/link";

import { Badge } from "@/components/ui";
import { KIND_LABELS, STATUS_LABELS, STATUS_TONES } from "@/lib/labels";
import type { Item } from "@/lib/types";

import { RestoreButton } from "./restore-button";

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

import styles from "./item-card.module.css";

export function ItemCard({ item, query }: { item: Item; query?: string }) {
  const meta = [
    KIND_LABELS[item.kind],
    item.year ? String(item.year) : null,
    item.rating ? `★ ${item.rating}` : null,
  ].filter(Boolean);

  return (
    <article className={styles.card}>
      {item.cover_key ? (
        <img
          className={styles.cover}
          src={`/media/${item.cover_key}`}
          alt=""
          loading="lazy"
        />
      ) : null}

      <div className={styles.header}>
        <h2 className={styles.title}>
          {item.deleted_at ? (
            item.title
          ) : (
            <Link className={styles.link} href={`/items/${item.id}`}>
              <Highlight text={item.title} query={query} />
            </Link>
          )}
        </h2>
        <Badge tone={STATUS_TONES[item.status]}>
          {STATUS_LABELS[item.status]}
        </Badge>
      </div>

      {item.subtitle ? (
        <p className={styles.subtitle}>{item.subtitle}</p>
      ) : null}

      <p className={styles.meta}>{meta.join(" · ")}</p>

      {item.review ? <p className={styles.review}>{item.review}</p> : null}

      {item.deleted_at ? (
        <div className={styles.deleted}>
          <Badge tone="danger">В корзине</Badge>
          <RestoreButton itemId={item.id} />
        </div>
      ) : null}

      {item.tags.length > 0 ? (
        <ul className={styles.tags}>
          {item.tags.map((tag) => (
            <li key={tag}>
              <Badge>{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
