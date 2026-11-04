"use client";

import { useI18n } from "@/lib/locale-context";

import styles from "./hide-recommendation.module.css";

export function HideRecommendation({
  compact = false,
  onHide,
}: {
  compact?: boolean;
  onHide: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      aria-label={t("recommendations.notInterested")}
      className={`${styles.button} ${compact ? styles.compact : ""}`}
      onClick={onHide}
      title={t("recommendations.notInterested")}
      type="button"
    >
      {compact ? t("recommendations.hide") : t("recommendations.notInterested")}
    </button>
  );
}
