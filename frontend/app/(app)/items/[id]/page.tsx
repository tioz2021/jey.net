import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemActions } from "@/components/items/item-actions";
import { MovieInfo } from "@/components/items/movie-info";
import { RatingStars } from "@/components/items/rating-stars";
import { RefreshMovieButton } from "@/components/items/refresh-movie-button";
import { ItemNeighbors } from "@/components/items/item-neighbors";
import { Badge, Card, PageHeader } from "@/components/ui";
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

      <PageHeader
        action={
          <>
            {item.external_source === "tmdb" ? (
              <RefreshMovieButton itemId={item.id} />
            ) : null}
            <ItemActions itemId={item.id} title={displayTitle} />
          </>
        }
        subtitle={displaySubtitle ?? undefined}
        title={
          <>
            {displayTitle}
            {item.year ? <span className={styles.year}> ({item.year})</span> : null}
          </>
        }
      />

      <div className={styles.stack}>
        <ItemNeighbors nextHref={nextHref} prevHref={prevHref} />
        <div className={styles.body}>
          <div className={styles.poster}>
            {item.cover_key ? (
              // Covers are ready-made WebP renditions served by our API.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/media/${item.cover_key}`}
                alt={t("cover.altTitle", { title: displayTitle })}
              />
            ) : (
              <div className={styles.posterPlaceholder}>{t("cover.none")}</div>
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
                <dt>{t("item.link")}</dt>
                <dd>
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {item.source_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
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
                <dt>{t("item.added")}</dt>
                <dd>
                  {formatDateI18n(locale, item.created_at, {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </dd>
              </div>

              <div className={styles.metaRow}>
                <dt>{t("item.changed")}</dt>
                <dd>
                  {formatDateI18n(locale, item.updated_at, {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </dd>
              </div>

              {item.deleted_at ? (
                <div className={styles.metaRow}>
                  <dt>В корзине</dt>
                  <dd>{formatDate(item.deleted_at)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        </div>

        {item.details ? (
          <MovieInfo
            details={item.details}
            locale={locale}
            tmdbId={
              item.external_source === "tmdb" ? item.external_id : null
            }
          />
        ) : null}

        {item.review ? (
          <Card title={t("item.note")}>
            <p className={styles.review}>{item.review}</p>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
