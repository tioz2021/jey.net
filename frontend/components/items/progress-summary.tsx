"use client";

import { useI18n } from "@/lib/locale-context";
import type { ItemKind, ItemProgress } from "@/lib/types";

import styles from "./progress-editor.module.css";

/** Read-only progress block for public anime, book and game pages. */
export function ProgressSummary({
  item,
}: {
  item: {
    kind: ItemKind;
    details?: {
      progress?: ItemProgress | null;
      number_of_episodes?: number | null;
      page_count?: number | null;
    } | null;
  };
}) {
  const { t } = useI18n();
  const progress = item.details?.progress;
  if (!progress || !["anime", "book", "game"].includes(item.kind)) {
    return null;
  }

  const total =
    progress.total ??
    (item.kind === "anime"
      ? item.details?.number_of_episodes
      : item.kind === "book"
        ? item.details?.page_count
        : null);
  const percent =
    total && total > 0
      ? Math.min(100, Math.round((progress.current / total) * 100))
      : null;
  const label =
    progress.unit === "episode"
      ? t("progress.episodesShort", { current: progress.current, total: total ?? "—" })
      : progress.unit === "page"
        ? t("progress.pagesShort", { current: progress.current, total: total ?? "—" })
        : t("progress.hoursShort", { current: progress.current });

  return (
    <div className={styles.summary}>
      <span>{label}</span>
      {percent !== null ? (
        <div className={styles.track}>
          <div className={styles.bar} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}
