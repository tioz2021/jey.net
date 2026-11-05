import { Card } from "@/components/ui";
import { formatMoney, formatNumber, translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import type { ItemKind, MovieDetails } from "@/lib/types";

import styles from "./movie-info.module.css";

/** Shikimori stores BBCode-like character references in descriptions. */
function cleanOverview(value: string | null): string | null {
  if (!value) return value;
  return value
    .replace(
      /\[\/?(?:character|anime|manga|person|url|spoiler|b|i|u|s|quote|code|center|color|size)(?:=[^\]]*)?\]/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Metadata snapshot: overview, runtime and cast names, with TMDB credit. */
export async function MovieInfo({
  details,
  tmdbId,
  locale,
  kind = "movie",
}: {
  details: MovieDetails;
  tmdbId: string | null;
  locale: Locale;
  kind?: ItemKind;
}) {
  const translation =
    details.translations?.[locale] ??
    details.translations?.en ??
    details.translations?.ru;
  const localized = {
    overview: translation?.overview ?? details.overview,
    tagline: translation?.tagline ?? details.tagline,
    countries:
      translation && translation.countries.length > 0
        ? translation.countries
        : (details.countries ?? []),
    languages:
      translation && translation.languages.length > 0
        ? translation.languages
        : (details.languages ?? []),
    companies:
      translation && translation.companies.length > 0
        ? translation.companies
        : (details.companies ?? []),
  };
  const t = (
    key: Parameters<typeof translate>[1],
    values?: Record<string, string | number>,
  ) => translate(locale, key, values);

  const isBook = kind === "book";
  const isGame = kind === "game";
  const isAnime = kind === "anime";
  const overview = isAnime ? cleanOverview(localized.overview) : localized.overview;
  const animeChips = isAnime
    ? [
        details.anime_format?.toUpperCase(),
        details.number_of_episodes
          ? t("anime.episodeShort", { count: details.number_of_episodes })
          : null,
        ...(details.genres ?? []).slice(0, 4),
      ].filter((value): value is string => Boolean(value))
    : [];
  const bookAuthors = details.authors?.length
    ? details.authors
    : details.director
      ? [details.director]
      : [];

  const facts: Array<[string, string]> = [];
  if (isAnime) {
    if (details.anime_format) facts.push([t("anime.format"), details.anime_format]);
    if (details.number_of_episodes) {
      facts.push([t("anime.episodes"), String(details.number_of_episodes)]);
    }
    if (details.companies?.length) {
      facts.push([t("anime.studio"), details.companies.join(", ")]);
    }
    if (details.release_date) {
      facts.push([t("movie.release"), details.release_date]);
    }
    if (details.vote_average_tenths) {
      facts.push([t("anime.rating"), (details.vote_average_tenths / 10).toFixed(1)]);
    }
    if (details.genres?.length) {
      facts.push([t("anime.genres"), details.genres.join(", ")]);
    }
    if (details.status) {
      facts.push([t("anime.status"), details.status]);
    }
  } else if (isGame) {
    if (details.developers?.length) {
      facts.push([t("game.developer"), details.developers.join(", ")]);
    }
    if (details.publishers?.length) {
      facts.push([t("game.publisher"), details.publishers.join(", ")]);
    }
    if (details.platforms?.length) {
      facts.push([t("game.platforms"), details.platforms.join(", ")]);
    }
    if (details.genres?.length) {
      facts.push([t("game.genres"), details.genres.join(", ")]);
    }
    if (details.release_date) {
      facts.push([t("movie.release"), details.release_date]);
    }
    const score = details.vote_average_tenths;
    if (score) {
      facts.push(["IGDB", (score / 10).toFixed(1)]);
    }
  } else if (isBook) {
    if (bookAuthors.length > 0) {
      facts.push([t("book.authors"), bookAuthors.join(", ")]);
    }
    if (details.publisher) {
      facts.push([t("book.publisher"), details.publisher]);
    }
    if (details.page_count) {
      facts.push([t("book.pages"), String(details.page_count)]);
    }
    if (details.isbn) {
      facts.push([t("book.isbn"), details.isbn]);
    }
    if (details.genres?.length) {
      facts.push([t("book.genres"), details.genres.join(", ")]);
    }
    if (details.release_date) {
      facts.push([t("movie.release"), details.release_date]);
    }
  } else if (details.original_title) {
    facts.push([t("movie.originalTitle"), details.original_title]);
  }
  if (!isBook && !isGame && !isAnime && details.runtime) {
    facts.push([
      t("movie.runtime"),
      t("movie.minutes", { count: details.runtime }),
    ]);
  }
  if (kind === "tv" && details.number_of_seasons) {
    facts.push([
      t("tv.seasons", { count: details.number_of_seasons }),
      String(details.number_of_seasons),
    ]);
  }
  if (kind === "tv" && details.number_of_episodes) {
    facts.push([
      t("tv.episodes", { count: details.number_of_episodes }),
      String(details.number_of_episodes),
    ]);
  }
  if (!isBook && !isGame && !isAnime && details.release_date) {
    facts.push([t("movie.release"), details.release_date]);
  }
  const countries = localized.countries;
  const languages = localized.languages;
  const companies = localized.companies;

  if (countries.length > 0) {
    facts.push([t("movie.countries"), countries.join(", ")]);
  }
  if (languages.length > 0) {
    facts.push([t("movie.languages"), languages.join(", ")]);
  }
  if (companies.length > 0) {
    facts.push([t("movie.studios"), companies.join(", ")]);
  }
  if (!isBook && !isGame && !isAnime && details.budget) {
    facts.push([t("movie.budget"), formatMoney(locale, details.budget)]);
  }
  if (!isBook && !isGame && !isAnime && details.revenue) {
    facts.push([t("movie.revenue"), formatMoney(locale, details.revenue)]);
  }
  if (!isBook && !isGame && !isAnime && details.imdb_id) {
    facts.push(["IMDb", `tt${details.imdb_id.replace(/^tt/, "")}`]);
  }
  if (!isBook && !isGame && !isAnime && details.vote_average_tenths) {
    const score = (details.vote_average_tenths / 10).toFixed(1);
    const votes = details.vote_count
      ? ` · ${t("movie.votes", { count: formatNumber(locale, details.vote_count) })}`
      : "";
    facts.push([t("movie.tmdbRating"), `${score}${votes}`]);
  }

  return (
    <>
      <Card
        title={
          kind === "tv"
            ? t("tv.about")
            : isBook
              ? t("book.about")
              : isGame
                ? t("game.about")
                : isAnime
                  ? t("anime.about")
                  : t("movie.about")
        }
      >
        {localized.tagline ? (
          <p className={styles.tagline}>«{localized.tagline}»</p>
        ) : null}
        {animeChips.length > 0 ? (
          <ul className={styles.chips}>
            {animeChips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        ) : null}
        {overview ? (
          <p className={styles.overview}>{overview}</p>
        ) : (
          <p className={styles.muted}>
            {isBook
              ? t("book.overviewEmpty")
              : isGame
                ? t("game.empty")
                : isAnime
                  ? t("anime.empty")
                  : t("movie.overviewEmpty")}
          </p>
        )}

        {facts.length > 0 ? (
          <dl className={styles.facts}>
            {facts.map(([label, value]) => (
              <div className={styles.fact} key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {!isBook && !isGame && !isAnime && details.imdb_id ? (
          <p className={styles.links}>
            <a
              href={`https://www.imdb.com/title/tt${details.imdb_id.replace(/^tt/, "")}`}
              rel="noreferrer"
              target="_blank"
            >
              {t("movie.imdbPage")}
            </a>
          </p>
        ) : null}

        {isGame ? (
          <p className={styles.source}>{t("game.credit")}</p>
        ) : null}
        {isAnime ? (
          <p className={styles.source}>{t("anime.credit")}</p>
        ) : null}
        {tmdbId && !isGame && !isAnime ? (
          <p className={styles.source}>
            {t("movie.credit")}{" "}
            <a
              href={`https://www.themoviedb.org/${kind === "tv" ? "tv" : "movie"}/${tmdbId}`}
              rel="noreferrer"
              target="_blank"
            >
              TMDB
            </a>
            .
          </p>
        ) : null}
      </Card>

    </>
  );
}

