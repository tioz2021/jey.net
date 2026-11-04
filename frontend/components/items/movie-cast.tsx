"use client";

import { useState } from "react";

import { CastPhoto } from "@/components/items/cast-photo";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { Locale } from "@/lib/i18n";
import type { MovieDetails } from "@/lib/types";

import styles from "./movie-info.module.css";

const INITIAL_CAST = 6;

export function MovieCast({
  details,
  locale,
}: {
  details: MovieDetails;
  locale: Locale;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const translation =
    details.translations?.[locale] ??
    details.translations?.en ??
    details.translations?.ru;
  const cast: unknown[] =
    translation && translation.cast.length > 0
      ? translation.cast
      : (details.cast ?? []);

  if (cast.length === 0) return null;

  const visible = expanded ? cast : cast.slice(0, INITIAL_CAST);

  return (
    <Card title={t("movie.cast")}>
      <ul className={styles.castGrid}>
        {visible.map((person, index) => {
          const member =
            typeof person === "string"
              ? { tmdb_id: 0, name: person, character: null, profile_path: null }
              : (person as {
                  tmdb_id: number;
                  name: string;
                  character: string | null;
                  profile_path: string | null;
                });
          const body = (
            <>
              <CastPhoto name={member.name} profilePath={member.profile_path} />
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
      {cast.length > INITIAL_CAST ? (
        <Button
          onClick={() => setExpanded((value) => !value)}
          size="sm"
          variant="ghost"
        >
          {expanded ? t("item.collapseCast") : t("item.showAllCast", { count: cast.length })}
        </Button>
      ) : null}
    </Card>
  );
}
