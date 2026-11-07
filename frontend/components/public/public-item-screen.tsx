"use client";

import { useEffect, useState } from "react";

import { Comments } from "@/components/comments";
import { IconBook, IconFilm, IconGame, IconImage, IconOther, IconTv } from "@/components/icons";
import { ItemReview } from "@/components/items/item-review";
import { MovieCast } from "@/components/items/movie-cast";
import { MovieInfo } from "@/components/items/movie-info";
import { ProgressSummary } from "@/components/items/progress-summary";
import { RatingStars } from "@/components/items/rating-stars";
import { SeriesEpisodes } from "@/components/items/series-episodes";
import { SimilarItems } from "@/components/items/similar-items";
import { Reactions } from "@/components/reactions";
import { ReportButton } from "@/components/report-button";
import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/i18n";
import { KIND_KEYS, statusKey } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import { STATUS_TONES } from "@/lib/labels";
import { localizedSubtitle, localizedTitle } from "@/lib/item-title";
import { AppLink } from "@/lib/navigation";
import type { PublicItem } from "@/lib/types";

import styles from "./public-item-screen.module.css";
import { LoadingScreen } from "@/components/loading-screen";

const KIND_ICONS = { movie: IconFilm, tv: IconTv, book: IconBook, game: IconGame, anime: IconTv, image: IconImage, other: IconOther } as const;

export function PublicItemScreen({ id, itemId }: { id: string; itemId: string }) {
  const { t, locale } = useI18n();
  const [item, setItem] = useState<PublicItem | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/public/users/${encodeURIComponent(id)}`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((profile) => {
        const userId = profile.profile.id as string;
        setOwnerId(userId);
        const match = (profile.items as Array<{ id: string; slug: string }>).find(
          (entry) => entry.slug === itemId || entry.id === itemId,
        );
        if (!match) return Promise.reject();
        return fetch(`/api/v1/public/users/${encodeURIComponent(userId)}/items/${encodeURIComponent(match.id)}`, { credentials: "include" });
      })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body) => setItem({ ...body.item, progress_visible: body.progress_visible }))
      .catch(() => setError(true));
  }, [id, itemId]);

  if (error) return <main><p>Запись не найдена</p></main>;
  if (!item) return <main><LoadingScreen /></main>;

  const displayTitle = localizedTitle(item, locale);
  const displaySubtitle = localizedSubtitle(item, locale);
  const KindIcon = KIND_ICONS[item.kind];

return (
  <article className={styles.article}>
    <header className={styles.heading}>
      <AppLink className={styles.back} href={`/u/${id}`}>
        {t("item.backProfile")}
      </AppLink>
      <p className={styles.kicker}>{t(KIND_KEYS[item.kind])}</p>
      <h1 className={styles.title}>
        {displayTitle}
        {item.year ? <span className={styles.year}> ({item.year})</span> : null}
      </h1>
      {displaySubtitle ? (
        <p className={styles.subtitle}>{displaySubtitle}</p>
      ) : null}
      <div className={styles.reportCorner}>
        <ReportButton ownerId={id} targetId={item.id} targetType="item" />
      </div>
      <div className={styles.reactionCorner}>
        <Reactions itemId={item.id} />
      </div>
    </header>

    <div className={styles.layout}>
      <aside className={styles.rail}>
        <div className={styles.cover}>
          {item.cover_key ? (
            // eslint-disable-next-line @next/next/no-img-element -- WebP rendition
            <img
              src={`/media/${item.cover_key}`}
              alt={t("cover.altTitle", { title: displayTitle })}
            />
          ) : (
            <div className={styles.coverPlaceholder}>
              <KindIcon size={36} />
              <span>{t(KIND_KEYS[item.kind])}</span>
            </div>
          )}
        </div>

        <div className={styles.railPanel}>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>{t("item.status")}</dt>
              <dd>
                <Badge tone={STATUS_TONES[item.status]}>
                  {t(statusKey(item.kind, item.status))}
                </Badge>
              </dd>
            </div>

            <div className={styles.fact}>
              <dt>{t("item.rating")}</dt>
              <dd>
                {item.rating ? (
                  <RatingStars
                    label={t("item.ratingOf", { rating: item.rating })}
                    size={12}
                    value={item.rating}
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>

            <div className={styles.fact}>
              <dt>{t("public.updated")}</dt>
              <dd>
                {formatDate(locale, item.updated_at, {
                  dateStyle: "medium",
                })}
              </dd>
            </div>
          </dl>
        </div>
      </aside>

      <div className={styles.main}>
        <ProgressSummary item={item} />

        {item.details ? (
          <MovieInfo
            details={item.details}
            kind={item.kind}
            locale={locale}
            tmdbId={
              item.external_source === "tmdb" ? item.external_id : null
            }
          />
        ) : null}

        {item.review ? (
          <ItemReview text={item.review} title={t("public.itemNote")} />
        ) : null}
        <Comments itemId={item.id} userId={id} />
        {item.kind === "tv" &&
        item.details?.seasons &&
        item.details.seasons.length > 0 &&
        item.progress_visible !== false ? (
          <SeriesEpisodes
            itemId={item.id}
            publicUserId={id}
            seasons={item.details.seasons}
            totalEpisodes={item.details.number_of_episodes}
            watched={item.details.watched_episodes ?? []}
          />
        ) : null}
        <SimilarItems itemId={item.id} publicView />
        {item.details ? (
          <MovieCast details={item.details} locale={locale} />
        ) : null}
      </div>
    </div>
  </article>
);
}
