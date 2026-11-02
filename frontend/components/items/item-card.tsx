import Link from "next/link";

import { Badge } from "@/components/ui";
import { KIND_LABELS, STATUS_LABELS, STATUS_TONES } from "@/lib/labels";
import type { Item } from "@/lib/types";

import styles from "./item-card.module.css";

export function ItemCard({ item }: { item: Item }) {
  const meta = [
    KIND_LABELS[item.kind],
    item.year ? String(item.year) : null,
    item.rating ? `★ ${item.rating}` : null,
  ].filter(Boolean);

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Link className={styles.link} href={`/items/${item.id}`}>
            {item.title}
          </Link>
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
