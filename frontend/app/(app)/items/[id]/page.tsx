import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemActions } from "@/components/items/item-actions";
import { MovieInfo } from "@/components/items/movie-info";
import { RatingStars } from "@/components/items/rating-stars";
import { SeriesEpisodes } from "@/components/items/series-episodes";
import { RefreshMovieButton } from "@/components/items/refresh-movie-button";
import { ItemNeighbors } from "@/components/items/item-neighbors";
import {
  IconBook,
  IconFilm,
  IconImage,
  IconOther,
  IconTv,
} from "@/components/icons";
import { Badge, Card } from "@/components/ui";
import { KIND_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import { STATUS_TONES } from "@/lib/labels";
import { formatDate as formatDateI18n, translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import {
  localizedSubtitle,
  localizedTags,
  localizedTitle,
} from "@/lib/item-title";
import { backendFetch } from "@/lib/server-api";
import type { ItemNeighbors as ItemNeighborsResponse, ItemResponse } from "@/lib/types";

import styles from "./page.module.css";

const KIND_ICONS = {
  movie: IconFilm,
  tv: IconTv,
  book: IconBook,
  image: IconImage,
  other: IconOther,
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return { title: `${translate(locale, "page.item")} — jey.net` };
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormat.format(new Date(value));
}

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const { id } = await params;
  const raw = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  const backHref = `/items${queryString ? `?${queryString}` : ""}`;

  const response = await backendFetch(`/items/${encodeURIComponent(id)}`);

  if (response.status === 400 || response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    return (
      <main>
        <Card title={t("item.loadErrorTitle")}>
          <p className={styles.muted}>{t("item.loadErrorText")}</p>
          <p>
            <Link href="/items">← К записям</Link>
          </p>
        </Card>
      </main>
    );
  }

  const { item } = (await response.json()) as ItemResponse;
  const displayTitle = localizedTitle(item, locale);
  const displaySubtitle = localizedSubtitle(item, locale);
  const displayTags = localizedTags(item, locale);
  const KindIcon = KIND_ICONS[item.kind];

  let prevHref: string | null = null;
  let nextHref: string | null = null;

  // Search results are ordered by relevance, so arrows would be misleading.
  if (!query.get("q")) {
    const neighborsResponse = await backendFetch(
      `/items/${encodeURIComponent(id)}/neighbors${queryString ? `?${queryString}` : ""}`,
    );

    if (neighborsResponse.ok) {
      const neighbors = (await neighborsResponse.json()) as ItemNeighborsResponse;
      const suffix = queryString ? `?${queryString}` : "";

      prevHref = neighbors.prev_id ? `/items/${neighbors.prev_id}${suffix}` : null;
      nextHref = neighbors.next_id ? `/items/${neighbors.next_id}${suffix}` : null;
    }
  }

  return (
    <main>
      <p className={styles.back}>
        <Link href={backHref}>{t("item.back")}</Link>
      </p>

      <section className={styles.hero}>
        <div className={styles.cover}>
          {item.cover_key ? (
            // Covers are ready-made WebP renditions served by our API.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/media/${item.cover_key}`}
              alt={t("cover.altTitle", { title: displayTitle })}
            />
          ) : (
            <div className={styles.coverPlaceholder}>
              <KindIcon size={40} />
              <span>{t(KIND_KEYS[item.kind])}</span>
            </div>
          )}
        </div>

        <div className={styles.heroBody}>
          <div className={styles.heroTop}>
            <div className={styles.heading}>
              <p className={styles.kicker}>
                {t(KIND_KEYS[item.kind])}
                {item.year ? ` · ${item.year}` : ""}
              </p>
              <h1 className={styles.title}>{displayTitle}</h1>
              {displaySubtitle ? (
                <p className={styles.subtitle}>{displaySubtitle}</p>
              ) : null}

              <div className={styles.badges}>
                <Badge tone={STATUS_TONES[item.status]}>
                  {t(STATUS_KEYS[item.status])}
                </Badge>
                {item.rating ? (
                  <span className={styles.rating}>
                    <RatingStars
                      label={t("item.ratingOf", { rating: item.rating })}
                      size={16}
                      value={item.rating}
                    />
                  </span>
                ) : null}
              </div>

              {displayTags.length > 0 ? (
                <ul className={styles.tags}>
                  {displayTags.map((tag) => (
                    <li key={tag}>
                      <Badge>{tag}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className={styles.actions}>
              {item.external_source === "tmdb" ? (
                <RefreshMovieButton itemId={item.id} />
              ) : null}
              <ItemActions itemId={item.id} title={displayTitle} />
            </div>
          </div>

          <div className={styles.meta}>
            {item.source_url ? (
              <a
                className={styles.source}
                href={item.source_url}
                rel="noreferrer noopener"
                target="_blank"
              >
                {t("item.link")} ↗
              </a>
            ) : null}
            <span>
              {t("item.added")}:{" "}
              {formatDateI18n(locale, item.created_at, {
                dateStyle: "medium",
              })}
            </span>
            <span>
              {t("item.changed")}:{" "}
              {formatDateI18n(locale, item.updated_at, {
                dateStyle: "medium",
              })}
            </span>
            {item.deleted_at ? (
              <span>
                {t("card.deleted")}: {formatDate(item.deleted_at)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className={styles.stack}>
        <ItemNeighbors nextHref={nextHref} prevHref={prevHref} />

        {item.review ? (
          <Card title={t("item.note")}>
            <p className={styles.review}>{item.review}</p>
          </Card>
        ) : null}

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
        item.details.seasons.length > 0 ? (
          <SeriesEpisodes
            itemId={item.id}
            seasons={item.details.seasons}
            totalEpisodes={item.details.number_of_episodes}
            watched={item.details.watched_episodes ?? []}
          />
        ) : null}
      </div>
    </main>
  );
}
