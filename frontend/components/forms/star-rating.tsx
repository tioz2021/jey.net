"use client";

import { useId, useState } from "react";

import fieldStyles from "@/components/ui/Field.module.css";
import { useI18n } from "@/lib/locale-context";

import styles from "./star-rating.module.css";

const STARS = Array.from({ length: 10 }, (_, index) => index + 1);

export function StarRating({
  value,
  onChange,
  label,
  hint,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint?: string;
  error?: string;
}) {
  const { t } = useI18n();
  const groupId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const selected = Number(value) || 0;
  const shown = hover ?? selected;

  return (
    <div className={fieldStyles.field}>
      <span className={fieldStyles.label}>{label}</span>

      <div
        aria-invalid={error ? true : undefined}
        aria-label={label}
        className={styles.stars}
        onMouseLeave={() => setHover(null)}
        role="radiogroup"
      >
        {STARS.map((star) => (
          <label
            className={styles.starLabel}
            key={star}
            onMouseEnter={() => setHover(star)}
          >
            <input
              aria-label={t("item.ratingOf", { rating: star })}
              checked={selected === star}
              className={styles.input}
              name={`rating-${groupId}`}
              onChange={() => onChange(String(star))}
              onFocus={() => setHover(star)}
              type="radio"
              value={star}
            />
            <svg
              aria-hidden="true"
              className={`${styles.star} ${star <= shown ? styles.active : ""}`}
              fill="none"
              height="22"
              viewBox="0 0 24 24"
              width="22"
            >
              <path
                d="m12 2.8 2.8 5.9 6.4.9-4.6 4.6 1.1 6.4-5.7-3-5.7 3 1.1-6.4L3 9.6l6.4-.9z"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
            </svg>
          </label>
        ))}

        <span className={styles.value}>
          {selected > 0 ? t("item.ratingOf", { rating: selected }) : "—"}
        </span>
      </div>

      <div className={styles.footer}>
        {hint ? <p className={fieldStyles.hint}>{hint}</p> : <span />}
        {selected > 0 ? (
          <button
            className={styles.clear}
            onClick={() => {
              setHover(null);
              onChange("");
            }}
            type="button"
          >
            {t("form.ratingClear")}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className={fieldStyles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
