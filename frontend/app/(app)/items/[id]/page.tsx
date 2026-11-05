import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemActions } from "@/components/items/item-actions";
import { KindDetails } from "@/components/items/details";
import { MovieCast } from "@/components/items/movie-cast";
import { SimilarItems } from "@/components/items/similar-items";

import { ItemReview } from "@/components/items/item-review";
import { ProgressEditor } from "@/components/items/progress-editor";
import { AnimeContinue } from "@/components/items/anime-continue";
import { ActionDate } from "@/components/items/action-date";
import { RatingStars } from "@/components/items/rating-stars";
import { SeriesEpisodes } from "@/components/items/series-episodes";
import { RefreshMovieButton } from "@/components/items/refresh-movie-button";
import { ItemNeighbors } from "@/components/items/item-neighbors";
import {
  IconBook,
  IconFilm,
  IconGame,
  IconImage,
  IconOther,
  IconTv,
} from "@/components/icons";
import { Badge, Card } from "@/components/ui";
import { KIND_KEYS, statusKey } from "@/lib/i18n/labels";
import { STATUS_TONES } from "@/lib/labels";
import { formatDate as formatDateI18n, translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import {
  localizedSubtitle,
  localizedTitle,
} from "@/lib/item-title";
import { backendFetch } from "@/lib/server-api";
import type { ItemNeighbors as ItemNeighborsResponse, ItemResponse } from "@/lib/types";

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
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await getServerLocale();
  const response = await backendFetch(`/items/${encodeURIComponent(id)}`);
  if (response.ok) {
    const { item } = (await response.json()) as ItemResponse;
    return { title: `${item.title} — jey.net` };
  }
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

  const continueSeason = raw.season ? Number(raw.season) : undefined;
  const continueEpisode =
    raw.continue === "1" && raw.episode ? Number(raw.episode) : undefined;

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
      <header className={styles.heading}>
        <Link className={styles.back} href={backHref}>
          {t("item.back")}
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
              // Covers are ready-made WebP renditions served by our API.
              // eslint-disable-next-line @next/next/no-img-element
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
            <div className={styles.actions}>
              {item.external_source === "tmdb" ||
              item.external_source === "openlibrary" ? (
                <RefreshMovieButton itemId={item.id} />
              ) : null}
              <ItemActions itemId={item.id} title={displayTitle} />
            </div>

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
                      size={14}
                      value={item.rating}
                    />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>

              {item.source_url ? (
                <div className={styles.fact}>
                  <dt>{t("item.link")}</dt>
                  <dd>
                    <a
                      className={styles.source}
                      href={item.source_url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {t("item.link")} ↗
                    </a>
                  </dd>
                </div>
              ) : null}

              <div className={styles.fact}>
                <dt>{t("item.added")}</dt>
                <dd>
                  {formatDateI18n(locale, item.created_at, {
                    dateStyle: "medium",
                  })}
                </dd>
              </div>

              <div className={styles.fact}>
                <dt>{t("item.changed")}</dt>
                <dd>
                  {formatDateI18n(locale, item.updated_at, {
                    dateStyle: "medium",
                  })}
                </dd>
              </div>

              {item.deleted_at ? (
                <div className={styles.fact}>
                  <dt>{t("card.deleted")}</dt>
                  <dd>{formatDate(item.deleted_at)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </aside>

        <div className={styles.main}>
          <ItemNeighbors nextHref={nextHref} prevHref={prevHref} />

          <KindDetails item={item} locale={locale} />

          {item.review ? <ItemReview text={item.review} /> : null}

          {item.body ? (
            <ItemReview text={item.body} title={t("item.privateNote")} />
          ) : null}

          <ActionDate item={item} />
          <AnimeContinue item={item} />
          <ProgressEditor item={item} />

          {item.kind === "tv" &&
          item.details?.seasons &&
          item.details.seasons.length > 0 ? (
            <SeriesEpisodes
              itemId={item.id}
              seasons={item.details.seasons}
              totalEpisodes={item.details.number_of_episodes}
              watched={item.details.watched_episodes ?? []}
              initialSeason={continueSeason}
              highlightEpisode={continueEpisode}
            />
          ) : null}

          {item.details && (item.kind === "movie" || item.kind === "tv") ? (
            <MovieCast details={item.details} locale={locale} />
          ) : null}

          <SimilarItems itemId={item.id} />
        </div>
      </div>
    </main>
  );
}
