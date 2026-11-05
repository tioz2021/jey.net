"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HideRecommendation } from "@/components/hide-recommendation";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import {
  publicRecommendationKey,
  useHiddenRecommendations,
} from "@/lib/use-hidden-recommendations";
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
  const { hidden, hide } = useHiddenRecommendations();

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

  const visible = items.filter(
    (item) => !hidden.has(publicRecommendationKey(item.author_id, item.id)),
  );
  if (visible.length === 0) return null;

  return (
    <Card
      action={<Link href="/recommendations">{t("recommendations.title")}</Link>}
      title={t("recommendations.homeTitle")}
    >
      <ul className={styles.list}>
        {visible.map((item) => (
          <li key={`${item.author_id}-${item.id}`}>
            <Link className={styles.item} href={`/u/${item.author_handle}/item/${item.slug}`}>
              {item.cover_key ? (
                // eslint-disable-next-line @next/next/no-img-element -- local cover
                <img alt="" src={`/media/${item.cover_key}`} />
              ) : (
                <span aria-hidden="true" className={styles.placeholder} />
              )}
              <span className={styles.copy}>
                <span className={styles.title}>{item.title}</span>
                {item.year ? <span className={styles.meta}>{item.year}</span> : null}
              </span>
            </Link>
            <HideRecommendation
              compact
              onHide={() => hide(publicRecommendationKey(item.author_id, item.id))}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
