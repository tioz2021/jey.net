"use client";

import { useState } from "react";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";
import type { FriendReview } from "@/lib/types";

import styles from "./recommendation-reviews.module.css";

export function RecommendationReviews({ reviews }: { reviews: FriendReview[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (reviews.length === 0) return null;
  const visible = expanded ? reviews : reviews.slice(0, 2);

  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {visible.map((review) => (
          <li className={styles.review} key={`${review.author_handle}-${review.updated_at}`}>
            <div className={styles.head}>
              <AppLink href={`/u/${review.author_handle}`}>{review.author_name}</AppLink>
              <span>{review.rating}/10</span>
            </div>
            <p>{review.review}</p>
          </li>
        ))}
      </ul>
      {reviews.length > 2 ? (
        <button className={styles.more} onClick={() => setExpanded((value) => !value)} type="button">
          {expanded
            ? t("recommendations.showLess")
            : t("recommendations.showAllReviews", { count: reviews.length })}
        </button>
      ) : null}
    </div>
  );
}
