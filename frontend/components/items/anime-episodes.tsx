"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Item, MovieDetails, WatchedEpisode } from "@/lib/types";

import styles from "./anime-episodes.module.css";

function initialWatched(item: Item): Set<number> {
  const saved = (item.details?.watched_episodes ?? [])
    .filter((episode) => episode.season_number === 1)
    .map((episode) => episode.episode_number);
  if (saved.length > 0) return new Set(saved);
  const current = item.details?.progress?.current ?? 0;
  return new Set(Array.from({ length: current }, (_, index) => index + 1));
}

export function AnimeEpisodes({ item }: { item: Item }) {
  const router = useRouter();
  const { t } = useI18n();
  const total =
    item.details?.progress?.total ?? item.details?.number_of_episodes ?? null;
  const [watched, setWatched] = useState<Set<number>>(() => initialWatched(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const episodes = useMemo(
    () => Array.from({ length: total ?? 0 }, (_, index) => index + 1),
    [total],
  );

  if (item.kind !== "anime" || !item.details || !total) {
    return null;
  }

  async function persist(next: Set<number>, date = false) {
    setWatched(next);
    setBusy(true);
    setError(null);
    try {
      const watchedEpisodes: WatchedEpisode[] = [...next]
        .sort((a, b) => a - b)
        .map((episode) => ({ season_number: 1, episode_number: episode }));
      const details: MovieDetails = {
        ...item.details!,
        watched_episodes: watchedEpisodes,
        progress: {
          current: next.size,
          total,
          unit: "episode",
        },
        ...(date ? { last_action_at: new Date().toISOString() } : {}),
      };
      await api.items.update(item.id, { details });
      router.refresh();
    } catch {
      setError(t("animeEpisodes.error"));
    } finally {
      setBusy(false);
    }
  }

  function toggle(episode: number) {
    const next = new Set(watched);
    if (next.has(episode)) next.delete(episode);
    else next.add(episode);
    void persist(next, next.has(episode));
  }

  return (
    <Card title={t("animeEpisodes.title")}>
      <div className={styles.head}>
        <span>
          {t("tvEpisodes.progress", { watched: watched.size, total })}
        </span>
        <Button
          disabled={busy || watched.size === total}
          onClick={() => {
            const next = new Set(Array.from({ length: total }, (_, i) => i + 1));
            void persist(next, true);
          }}
          size="sm"
          variant="secondary"
        >
          {t("animeEpisodes.markAll")}
        </Button>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressBar}
          style={{ width: `${Math.round((watched.size / total) * 100)}%` }}
        />
      </div>
      <div className={styles.grid}>
        {episodes.map((episode) => {
          const checked = watched.has(episode);
          return (
            <button
              aria-pressed={checked}
              className={`${styles.episode} ${checked ? styles.checked : ""}`}
              disabled={busy}
              key={episode}
              onClick={() => toggle(episode)}
              type="button"
            >
              <span aria-hidden="true">{checked ? "✓" : ""}</span>
              {episode}
            </button>
          );
        })}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}
