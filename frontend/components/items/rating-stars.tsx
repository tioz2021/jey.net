import type { CSSProperties } from "react";

import styles from "./rating-stars.module.css";

const STARS = Array.from({ length: 10 }, (_, index) => index + 1);

/** Read-only rating: ten stars plus the score, Kinopoisk-style. */
export function RatingStars({
  value,
  label,
  size = 12,
  compact = false,
}: {
  value: number;
  label?: string;
  size?: number;
  compact?: boolean;
}) {
  const rounded = Math.max(0, Math.min(10, Math.round(value)));

  return (
    <span
      aria-label={label ?? `${value}/10`}
      className={`${styles.rating} ${compact ? styles.compact : ""}`}
      role="img"
      style={{ "--star-size": `${size}px` } as CSSProperties}
    >
      <span aria-hidden="true" className={styles.stars}>
        {STARS.map((star) => (
          <svg
            className={`${styles.star} ${star <= rounded ? styles.active : ""}`}
            fill="none"
            height={size}
            key={star}
            viewBox="0 0 24 24"
            width={size}
          >
            <path
              d="m12 2.8 2.8 5.9 6.4.9-4.6 4.6 1.1 6.4-5.7-3-5.7 3 1.1-6.4L3 9.6l6.4-.9z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        ))}
      </span>
      <span aria-hidden="true" className={styles.value}>
        {value}/10
      </span>
    </span>
  );
}
