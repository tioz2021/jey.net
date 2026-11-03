import { Card } from "@/components/ui";
import type { MovieDetails } from "@/lib/types";

import styles from "./movie-info.module.css";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function castName(person: string | { name: string }): string {
  return typeof person === "string" ? person : person.name;
}

/** Metadata snapshot: overview, runtime and cast names, with TMDB credit. */
export function MovieInfo({
  details,
  tmdbId,
}: {
  details: MovieDetails;
  tmdbId: string | null;
}) {
  const facts: Array<[string, string]> = [];
  if (details.original_title) {
    facts.push(["Оригинальное название", details.original_title]);
  }
  if (details.runtime) {
    facts.push(["Длительность", `${details.runtime} мин`]);
  }
  if (details.release_date) {
    facts.push(["Дата выхода", details.release_date]);
  }
  if (details.countries.length > 0) {
    facts.push(["Страны", details.countries.join(", ")]);
  }
  if (details.languages.length > 0) {
    facts.push(["Языки", details.languages.join(", ")]);
  }
  if (details.companies.length > 0) {
    facts.push(["Студии", details.companies.join(", ")]);
  }
  if (details.budget) {
    facts.push(["Бюджет", money.format(details.budget)]);
  }
  if (details.revenue) {
    facts.push(["Сборы", money.format(details.revenue)]);
  }
  if (details.imdb_id) {
    facts.push(["IMDb", `tt${details.imdb_id.replace(/^tt/, "")}`]);
  }

  return (
    <>
      <Card title="О фильме">
        {details.tagline ? (
          <p className={styles.tagline}>«{details.tagline}»</p>
        ) : null}
        {details.overview ? (
          <p className={styles.overview}>{details.overview}</p>
        ) : (
          <p className={styles.muted}>Описание пока не загружено.</p>
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
              Страница на IMDb
            </a>
          </p>
        ) : null}

        {tmdbId ? (
          <p className={styles.source}>
            Данные о фильме предоставлены{" "}
            <a
              href={`https://www.themoviedb.org/movie/${tmdbId}`}
              rel="noreferrer"
              target="_blank"
            >
              TMDB
            </a>
            .
          </p>
        ) : null}
      </Card>

      {details.cast.length > 0 ? (
        <Card title="В главных ролях">
          <ul className={styles.cast}>
            {details.cast.map((person, index) => {
              const member = typeof person === "string" ? null : person;
              return (
                <li key={`${castName(person)}-${index}`}>
                  {member && member.tmdb_id > 0 ? (
                    <a
                      href={`https://www.themoviedb.org/person/${member.tmdb_id}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {member.name}
                    </a>
                  ) : (
                    castName(person)
                  )}
                  {member?.character ? (
                    <span className={styles.character}> — {member.character}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
