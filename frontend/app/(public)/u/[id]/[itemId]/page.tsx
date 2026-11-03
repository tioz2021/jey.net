import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MovieInfo } from "@/components/items/movie-info";
import { RatingStars } from "@/components/items/rating-stars";
import { SeriesEpisodes } from "@/components/items/series-episodes";
import { Badge, Card, PageHeader } from "@/components/ui";
import { KIND_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import { STATUS_TONES } from "@/lib/labels";
import { formatDate, translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import {
  localizedSubtitle,
  localizedTags,
  localizedTitle,
} from "@/lib/item-title";
import { getPublicItem } from "@/lib/public-profile";
import { languageAlternates } from "@/lib/seo";

import styles from "./page.module.css";

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
      images: item.cover_key ? [`/media/${item.cover_key}`] : undefined,
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
  const displayTags = localizedTags(item, locale);

  return (
    <article className={styles.article}>
      <p className={styles.back}>
        <Link href={`/u/${id}`}>{t("item.backProfile")}</Link>
      </p>

      <PageHeader
        subtitle={displaySubtitle ?? undefined}
        title={
          <>
            {displayTitle}
            {item.year ? <span className={styles.year}> ({item.year})</span> : null}
          </>
        }
      />

      <div className={styles.stack}>
      <div className={styles.body}>
        <div className={styles.poster}>
          {item.cover_key ? (
            // eslint-disable-next-line @next/next/no-img-element -- WebP rendition
            <img
              src={`/media/${item.cover_key}`}
              alt={t("cover.altTitle", { title: displayTitle })}
            />
          ) : (
            <div className={styles.posterPlaceholder}>Нет обложки</div>
          )}
        </div>

        <Card title={t("item.properties")}>
          <dl className={styles.meta}>
            <div className={styles.metaRow}>
              <dt>{t("item.type")}</dt>
              <dd>
                <Badge>{t(KIND_KEYS[item.kind])}</Badge>
              </dd>
            </div>

            <div className={styles.metaRow}>
              <dt>{t("item.status")}</dt>
              <dd>
                <Badge tone={STATUS_TONES[item.status]}>
                  {t(STATUS_KEYS[item.status])}
                </Badge>
              </dd>
            </div>

            <div className={styles.metaRow}>
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

            <div className={styles.metaRow}>
              <dt>{t("item.year")}</dt>
              <dd>{item.year ?? "—"}</dd>
            </div>

            <div className={styles.metaRow}>
              <dt>{t("item.tags")}</dt>
              <dd>
                {item.tags.length > 0 ? (
                  <ul className={styles.tags}>
                    {displayTags.map((tag) => (
                      <li key={tag}>
                        <Badge>{tag}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
            </div>

            <div className={styles.metaRow}>
              <dt>{t("public.updated")}</dt>
              <dd>{formatDate(locale, item.updated_at, { dateStyle: "long" })}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {item.review ? (
        <Card title={t("public.itemNote")}>
          <p className={styles.review}>{item.review}</p>
        </Card>
      ) : null}

      {item.details ? (
        <MovieInfo
          details={item.details}
          kind={item.kind}
          locale={locale}
          tmdbId={item.external_source === "tmdb" ? item.external_id : null}
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
      </div>
    </article>
  );
}
