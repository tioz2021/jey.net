"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type {
  FriendRecommendation,
  TasteRecommendation,
} from "@/lib/types";

import styles from "./recommendation-highlights.module.css";

type Highlight = FriendRecommendation | TasteRecommendation;

/** A small taste-of-recommendations block on the records page. */
export function RecommendationHighlights() {
  const { t } = useI18n();
  const [items, setItems] = useState<Highlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.recommendations
      .taste()
      .then((taste) => {
        if (cancelled) return;
        if (taste.items.length > 0) {
          setItems(taste.items.slice(0, 3));
          return;
        }
        return api.recommendations.friends().then((friends) => {
          if (!cancelled) setItems(friends.items.slice(0, 3));
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <Card
      action={<Link href="/recommendations">{t("recommendations.title")}</Link>}
      title={t("recommendations.homeTitle")}
    >
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={`${item.author_id}-${item.id}`}>
            <Link className={styles.item} href={`/u/${item.author_id}/${item.id}`}>
              {item.cover_key ? (
                // eslint-disable-next-line @next/next/no-img-element -- local cover
                <img alt="" src={`/media/${item.cover_key}`} />
              ) : (
                <span aria-hidden="true" className={styles.placeholder} />
              )}
              <span>
                <span className={styles.title}>{item.title}</span>
                {item.year ? <span className={styles.meta}>{item.year}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
