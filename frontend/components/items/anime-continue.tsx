"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { nextAnimeEpisode } from "@/lib/continue";
import { useI18n } from "@/lib/locale-context";
import type { Item, MovieDetails } from "@/lib/types";

import styles from "./progress-editor.module.css";

/** Anime has no episode list yet, so continue advances the manual counter. */
export function AnimeContinue({ item }: { item: Item }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = nextAnimeEpisode(item.details);

  if (item.kind !== "anime" || !item.details || !next) {
    return null;
  }
  const nextEpisode = next;

  async function mark() {
    setBusy(true);
    setError(null);
    try {
      const details: MovieDetails = {
        ...item.details!,
        progress: {
          current: nextEpisode.episode,
          total:
            item.details?.progress?.total ??
            item.details?.number_of_episodes ??
            null,
          unit: "episode",
        },
      };
      await api.items.update(item.id, { details });
      router.refresh();
    } catch {
      setError(t("progress.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.continuePanel}>
      <div>
        <strong>{t("continue.nextAnime", { episode: nextEpisode.episode })}</strong>
        <p>{t("continue.markHint")}</p>
      </div>
      <Button disabled={busy} onClick={() => void mark()} size="sm">
        {busy
          ? t("progress.saving")
          : t("continue.markAnime", { episode: nextEpisode.episode })}
      </Button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
