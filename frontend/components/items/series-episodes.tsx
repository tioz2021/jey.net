"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type {
  SeasonSummary,
  TvEpisode,
  WatchedEpisode,
} from "@/lib/types";

import styles from "./series-episodes.module.css";

function key(season: number, episode: number): string {
  return `${season}:${episode}`;
}

export function SeriesEpisodes({
  itemId,
  seasons,
  watched,
  totalEpisodes,
  publicUserId,
}: {
  itemId: string;
  seasons: SeasonSummary[];
  watched: WatchedEpisode[];
  totalEpisodes?: number | null;
  publicUserId?: string;
}) {
  const { t } = useI18n();
  const available = useMemo(
    () =>
      seasons
        .filter((season) => season.episode_count > 0)
        .sort((a, b) => a.season_number - b.season_number),
    [seasons],
  );
  const [selected, setSelected] = useState<number>(
    available.find((season) => season.season_number > 0)?.season_number ??
      available[0]?.season_number ??
      1,
  );
  const [episodes, setEpisodes] = useState<TvEpisode[]>([]);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(
    () => new Set(watched.map((episode) => key(episode.season_number, episode.episode_number))),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const readOnly = Boolean(publicUserId);

  const total = totalEpisodes ?? seasons.reduce((sum, season) => sum + season.episode_count, 0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const request = publicUserId
      ? api.publicItems.episodes(publicUserId, itemId, selected)
      : api.items.episodes(itemId, selected);

    request
      .then((response) => {
        if (!cancelled) {
          setEpisodes(response.episodes);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEpisodes([]);
          setError(t("tvEpisodes.error"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [itemId, publicUserId, selected, t]);

  async function toggle(episode: number, next: boolean) {
    if (readOnly) {
      return;
    }
    setPending((current) => new Set(current).add(episode));
    try {
      await api.items.toggleEpisode(itemId, selected, episode, next);
      setWatchedSet((current) => {
        const copy = new Set(current);
        if (next) {
          copy.add(key(selected, episode));
        } else {
          copy.delete(key(selected, episode));
        }
        return copy;
      });
    } catch {
      setError(t("tvEpisodes.error"));
    } finally {
      setPending((current) => {
        const copy = new Set(current);
        copy.delete(episode);
        return copy;
      });
    }
  }

  async function toggleSeason(next: boolean) {
    if (readOnly) {
      return;
    }
    const numbers = episodes.map((episode) => episode.episode_number);
    await Promise.all(
      numbers.map((episode) => api.items.toggleEpisode(itemId, selected, episode, next)),
    );
    setWatchedSet((current) => {
      const copy = new Set(current);
      for (const episode of numbers) {
        if (next) {
          copy.add(key(selected, episode));
        } else {
          copy.delete(key(selected, episode));
        }
      }
      return copy;
    });
  }

  if (available.length === 0) {
    return null;
  }

  const watchedCount = watchedSet.size;
  const allSeasonWatched =
    episodes.length > 0 && episodes.every((episode) => watchedSet.has(key(selected, episode.episode_number)));

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t("tvEpisodes.title")}</h2>
        <span className={styles.progress}>
          {t("tvEpisodes.progress", { watched: watchedCount, total })}
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.toolbar}>
          <Select
            label={t("tvEpisodes.season")}
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {available.map((season) => (
              <option key={season.season_number} value={season.season_number}>
                {season.name || t("tvEpisodes.seasonNumber", { number: season.season_number })}
              </option>
            ))}
          </Select>

          {!readOnly ? (
            <Button
              disabled={episodes.length === 0}
              size="sm"
              variant="secondary"
              onClick={() => toggleSeason(!allSeasonWatched)}
            >
              {allSeasonWatched
                ? t("tvEpisodes.unmarkSeason")
                : t("tvEpisodes.markSeason")}
            </Button>
          ) : null}
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.muted}>{t("tvEpisodes.loading")}</p> : null}

        {!loading && !error ? (
          <ul className={styles.list}>
            {episodes.map((episode) => {
              const checked = watchedSet.has(key(selected, episode.episode_number));
              return (
                <li className={styles.episode} key={episode.episode_number}>
                  <label className={styles.check}>
                    <input
                      checked={checked}
                      disabled={readOnly || pending.has(episode.episode_number)}
                      onChange={(event) =>
                        toggle(episode.episode_number, event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span className={styles.number}>
                      {String(episode.episode_number).padStart(2, "0")}
                    </span>
                    <span className={styles.name}>{episode.name}</span>
                  </label>
                  <span className={styles.meta}>
                    {episode.air_date ? <span>{episode.air_date}</span> : null}
                    {episode.runtime ? (
                      <span>{t("movie.minutes", { count: episode.runtime })}</span>
                    ) : null}
                  </span>
                  {episode.overview ? (
                    <p className={styles.overview}>{episode.overview}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
