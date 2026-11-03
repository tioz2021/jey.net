import { CastPhoto } from "@/components/items/cast-photo";
import { Card } from "@/components/ui";
import { formatMoney, formatNumber, translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import type { ItemKind, MovieDetails } from "@/lib/types";

import styles from "./movie-info.module.css";

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
    cast:
      translation && translation.cast.length > 0
        ? translation.cast
        : (details.cast ?? []),
  };
  const t = (
    key: Parameters<typeof translate>[1],
    values?: Record<string, string | number>,
  ) => translate(locale, key, values);

  const facts: Array<[string, string]> = [];
  if (details.original_title) {
    facts.push([t("movie.originalTitle"), details.original_title]);
  }
  if (details.runtime) {
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
  if (details.release_date) {
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
  if (details.budget) {
    facts.push([t("movie.budget"), formatMoney(locale, details.budget)]);
  }
  if (details.revenue) {
    facts.push([t("movie.revenue"), formatMoney(locale, details.revenue)]);
  }
  if (details.imdb_id) {
    facts.push(["IMDb", `tt${details.imdb_id.replace(/^tt/, "")}`]);
  }
  if (details.vote_average_tenths) {
    const score = (details.vote_average_tenths / 10).toFixed(1);
    const votes = details.vote_count
      ? ` · ${t("movie.votes", { count: formatNumber(locale, details.vote_count) })}`
      : "";
    facts.push([t("movie.tmdbRating"), `${score}${votes}`]);
  }

  return (
    <>
      <Card title={kind === "tv" ? t("tv.about") : t("movie.about")}>
        {localized.tagline ? (
          <p className={styles.tagline}>«{localized.tagline}»</p>
        ) : null}
        {localized.overview ? (
          <p className={styles.overview}>{localized.overview}</p>
        ) : (
          <p className={styles.muted}>{t("movie.overviewEmpty")}</p>
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

        {details.imdb_id ? (
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

        {tmdbId ? (
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

      {localized.cast.length > 0 ? (
        <Card title={t("movie.cast")}>
          <ul className={styles.castGrid}>
            {localized.cast.map((person, index) => {
              const member =
                typeof person === "string"
                  ? {
                      tmdb_id: 0,
                      name: person,
                      character: null,
                      profile_path: null,
                    }
                  : person;
              const body = (
                <>
                  <CastPhoto
                    name={member.name}
                    profilePath={member.profile_path}
                  />
                  <span className={styles.castName}>{member.name}</span>
                  {member.character ? (
                    <span className={styles.character}>{member.character}</span>
                  ) : null}
                </>
              );

              return (
                <li key={`${member.name}-${index}`}>
                  {member.tmdb_id > 0 ? (
                    <a
                      className={styles.castCard}
                      href={`https://www.themoviedb.org/person/${member.tmdb_id}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className={styles.castCard}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
