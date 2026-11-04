"use client";

import { useI18n } from "@/lib/locale-context";

import styles from "./hide-recommendation.module.css";

export function HideRecommendation({ onHide }: { onHide: () => void }) {
  const { t } = useI18n();
  return (
    <button
      aria-label={t("recommendations.notInterested")}
      className={styles.button}
      onClick={onHide}
      title={t("recommendations.notInterested")}
      type="button"
    >
      ×
    </button>
  );
}
