import type { ItemProgress, MovieDetails, SeasonSummary, WatchedEpisode } from "@/lib/types";

export interface NextEpisode {
  season: number;
  episode: number;
  started: boolean;
}

export type EpisodeDetails = {
  seasons?: SeasonSummary[] | null;
  watched_episodes?: WatchedEpisode[] | null;
  number_of_episodes?: number | null;
  progress?: ItemProgress | null;
};

/** The first unwatched episode in season/episode order. */
export function nextTvEpisode(details: EpisodeDetails | null | undefined): NextEpisode | null {
  const seasons = (details?.seasons ?? [])
    .filter((season) => season.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);
  if (seasons.length === 0) {
    return null;
  }

  const watched = new Set(
    (details?.watched_episodes ?? []).map(
      (episode) => `${episode.season_number}:${episode.episode_number}`,
    ),
  );
  let first: NextEpisode | null = null;
  for (const season of seasons) {
    for (let episode = 1; episode <= season.episode_count; episode += 1) {
      const key = `${season.season_number}:${episode}`;
      if (!watched.has(key)) {
        const candidate = {
          season: season.season_number,
          episode,
          started: watched.size > 0,
        };
        if (candidate.started) {
          return candidate;
        }
        first ??= candidate;
      }
    }
  }
  return first;
}

/** The next episode from the manual anime progress counter. */
export function nextAnimeEpisode(
  details: EpisodeDetails | null | undefined,
): NextEpisode | null {
  const total = details?.progress?.total ?? details?.number_of_episodes ?? null;
  const watched = new Set(
    (details?.watched_episodes ?? [])
      .filter((episode) => episode.season_number === 1)
      .map((episode) => episode.episode_number),
  );
  if (watched.size > 0 && total !== null) {
    for (let episode = 1; episode <= total; episode += 1) {
      if (!watched.has(episode)) {
        return { season: 1, episode, started: true };
      }
    }
    return null;
  }

  const current = details?.progress?.current ?? 0;
  if (total !== null && current >= total) {
    return null;
  }
  const episode = current > 0 ? current + 1 : 1;
  if (total !== null && episode > total) {
    return null;
  }
  return { season: 1, episode, started: current > 0 };
}

export function continueHref(
  target: string,
  next: NextEpisode,
  kind: "tv" | "anime",
): string {
  const separator = target.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    continue: "1",
    episode: String(next.episode),
  });
  if (kind === "tv") {
    params.set("season", String(next.season));
  }
  return `${target}${separator}${params.toString()}`;
}

export type { MovieDetails };
