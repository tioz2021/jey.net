import { Card } from "@/components/ui";
import type { MovieDetails } from "@/lib/types";

import styles from "./movie-info.module.css";

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

  return (
    <>
      <Card title="О фильме">
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
            {details.cast.map((person) => (
              <li key={person}>{person}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
