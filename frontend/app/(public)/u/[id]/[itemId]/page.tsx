import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MovieInfo } from "@/components/items/movie-info";
import { RatingStars } from "@/components/items/rating-stars";
import { SeriesEpisodes } from "@/components/items/series-episodes";
import { ItemReview } from "@/components/items/item-review";
import { MovieCast } from "@/components/items/movie-cast";
import {
  IconBook,
  IconFilm,
  IconGame,
  IconImage,
  IconOther,
  IconTv,
} from "@/components/icons";
import { Badge } from "@/components/ui";
import { KIND_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import { STATUS_TONES } from "@/lib/labels";
import { formatDate, translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import {
  localizedSubtitle,
  localizedTitle,
} from "@/lib/item-title";
import { getPublicItem } from "@/lib/public-profile";
import { languageAlternates } from "@/lib/seo";

import styles from "./page.module.css";

const KIND_ICONS = {
  movie: IconFilm,
  tv: IconTv,
  book: IconBook,
  game: IconGame,
  anime: IconTv,
  image: IconImage,
  other: IconOther,
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}): Promise<Metadata> {
  const { id, itemId } = await params;
  const locale = await getServerLocale();
  const item = await getPublicItem(id, itemId);

  if (!item) {
    return {
      title: `${translate(locale, "notFound.record")} — jey.net`,
      robots: { index: false },
    };
  }

  const displayTitle = localizedTitle(item, locale);
  const displaySubtitle = localizedSubtitle(item, locale);
  const description = [
    displaySubtitle,
    item.year,
    translate(locale, KIND_KEYS[item.kind]),
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: `${displayTitle} — jey.net`,
    description,
    alternates: {
      canonical: `/u/${id}/${itemId}`,
      languages: languageAlternates(`/u/${id}/${itemId}`),
    },
    openGraph: {
      type: "article",
      title: displayTitle,
      description,
      url: `/u/${id}/${itemId}`,
      images: item.cover_key
        ? [`/media/${item.cover_key}`]
        : ["/og.png"],
    },
    twitter: {
      card: item.cover_key ? "summary" : "summary_large_image",
      title: displayTitle,
      description,
      images: item.cover_key
        ? [`/media/${item.cover_key}`]
        : ["/og.png"],
    },
  };
}

export default async function PublicItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const locale = await getServerLocale();
  const t = (
    key: Parameters<typeof translate>[1],
    values?: Record<string, string | number>,
  ) => translate(locale, key, values);
  const item = await getPublicItem(id, itemId);

  if (!item) {
    notFound();
  }

  const displayTitle = localizedTitle(item, locale);
  const displaySubtitle = localizedSubtitle(item, locale);
  const KindIcon = KIND_ICONS[item.kind];

  return (
    <article className={styles.article}>
      <header className={styles.heading}>
        <Link className={styles.back} href={`/u/${id}`}>
          {t("item.backProfile")}
        </Link>
        <p className={styles.kicker}>{t(KIND_KEYS[item.kind])}</p>
        <h1 className={styles.title}>
          {displayTitle}
          {item.year ? <span className={styles.year}> ({item.year})</span> : null}
        </h1>
        {displaySubtitle ? (
          <p className={styles.subtitle}>{displaySubtitle}</p>
        ) : null}
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
                    {t(STATUS_KEYS[item.status])}
                  </Badge>
                </dd>
              </div>

              <div className={styles.fact}>
                <dt>{t("item.rating")}</dt>
                <dd>
                  {item.rating ? (
                    <RatingStars
                      label={t("item.ratingOf", { rating: item.rating })}
                      size={14}
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
          {item.review ? (
            <ItemReview text={item.review} title={t("public.itemNote")} />
          ) : null}
          {item.details ? (
            <MovieCast details={item.details} locale={locale} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
