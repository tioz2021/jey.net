"use client";

import Link from "next/link";

import {
  continueHref,
  nextAnimeEpisode,
  nextTvEpisode,
  type EpisodeDetails,
} from "@/lib/continue";
import { useI18n } from "@/lib/locale-context";

import styles from "./item-card.module.css";

export function ContinueLink({
  kind,
  details,
  target,
}: {
  kind: "tv" | "anime";
  details: EpisodeDetails | null | undefined;
  target: string;
}) {
  const { t } = useI18n();
  const next =
    kind === "tv" ? nextTvEpisode(details) : nextAnimeEpisode(details);
  if (!next) {
    return null;
  }

  const label =
    kind === "tv"
      ? next.started
        ? t("continue.series", { season: next.season, episode: next.episode })
        : t("continue.startSeries", { season: next.season, episode: next.episode })
      : next.started
        ? t("continue.anime", { episode: next.episode })
        : t("continue.startAnime", { episode: next.episode });

  return (
    <Link className={styles.continue} href={continueHref(target, next, kind)}>
      {label}
    </Link>
  );
}
