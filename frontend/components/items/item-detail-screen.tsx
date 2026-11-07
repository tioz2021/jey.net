import { useEffect, useState } from "react";

import { AddToCollection } from "@/components/add-to-collection";
import { IconBook, IconFilm, IconGame, IconImage, IconOther, IconTv } from "@/components/icons";
import { AnimeEpisodes } from "@/components/items/anime-episodes";
import { DetailGroup } from "@/components/items/detail-group";
import { KindDetails } from "@/components/items/details";
import { ItemActions } from "@/components/items/item-actions";
import { ItemNeighbors } from "@/components/items/item-neighbors";
import { ItemReview } from "@/components/items/item-review";
import { MovieCast } from "@/components/items/movie-cast";
import { RatingStars } from "@/components/items/rating-stars";
import { RecordEditor } from "@/components/items/record-editor";
import { RefreshMovieButton } from "@/components/items/refresh-movie-button";
import { SeriesEpisodes } from "@/components/items/series-episodes";
import { SimilarItems } from "@/components/items/similar-items";
import { Badge, Card } from "@/components/ui";
import { useCatalogueSource } from "@/lib/data-source";
import { AppLink } from "@/lib/navigation";
import { formatDate as formatDateI18n } from "@/lib/i18n";
import { KIND_KEYS, statusKey } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import { STATUS_TONES } from "@/lib/labels";
import { localizedSubtitle, localizedTitle } from "@/lib/item-title";
import type { Item, ItemNeighbors as ItemNeighborsResponse } from "@/lib/types";

import styles from "./item-detail-screen.module.css";
import { LoadingScreen } from "@/components/loading-screen";

const KIND_ICONS = {
  movie: IconFilm,
  tv: IconTv,
  book: IconBook,
  game: IconGame,
  anime: IconTv,
  image: IconImage,
  other: IconOther,
} as const;

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });
const formatDate = (value: string) => dateFormat.format(new Date(value));

export function ItemDetailScreen({
  id,
  searchParams,
}: {
  id: string;
  searchParams: URLSearchParams;
}) {
  const { locale, t } = useI18n();
  const source = useCatalogueSource();
  const [item, setItem] = useState<Item | null>(null);
  const [neighbors, setNeighbors] = useState<ItemNeighborsResponse | null>(null);
  const [error, setError] = useState("");
  const queryString = searchParams.toString();
  const backHref = `/items${queryString ? `?${queryString}` : ""}`;
  const continueSeason = searchParams.get("season") ? Number(searchParams.get("season")) : undefined;
  const continueEpisode = searchParams.get("continue") === "1" && searchParams.get("episode") ? Number(searchParams.get("episode")) : undefined;

  useEffect(() => {
    let cancelled = false;
    setError("");
    source.get(id).then((next) => { if (!cancelled) setItem(next); }).catch((cause) => { if (!cancelled) setError(String(cause)); });
    if (!searchParams.get("q")) {
      fetch(`/api/v1/items/${encodeURIComponent(id)}/neighbors${queryString ? `?${queryString}` : ""}`, { credentials: "include" })
        .then((response) => (response.ok ? response.json() : null))
        .then((value) => { if (!cancelled && value) setNeighbors(value as ItemNeighborsResponse); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [id, queryString, searchParams, source]);

  if (error) return <main className={styles.page}><Card title={t("item.loadErrorTitle")}><p className={styles.muted}>{t("item.loadErrorText")}</p><p><AppLink href="/items">← К записям</AppLink></p></Card></main>;
  if (!item) return <main className={styles.page}><LoadingScreen /></main>;

  const displayTitle = localizedTitle(item, locale);
  const displaySubtitle = localizedSubtitle(item, locale);
  const KindIcon = KIND_ICONS[item.kind];
  const suffix = queryString ? `?${queryString}` : "";
  const prevHref = neighbors?.prev_id ? `/items/${neighbors.prev_id}${suffix}` : null;
  const nextHref = neighbors?.next_id ? `/items/${neighbors.next_id}${suffix}` : null;

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <AppLink className={styles.back} href={backHref}>{t("item.back")}</AppLink>
        <p className={styles.kicker}>{t(KIND_KEYS[item.kind])}</p>
        <h1 className={styles.title}>{displayTitle}{item.year ? <span className={styles.year}> ({item.year})</span> : null}</h1>
        {displaySubtitle ? <p className={styles.subtitle}>{displaySubtitle}</p> : null}
      </header>
      <div className={styles.layout}>
        <aside className={styles.rail}>
          <div className={styles.cover}>
            {item.cover_key ? <img src={`/media/${item.cover_key}`} alt={t("cover.altTitle", { title: displayTitle })} /> : <div className={styles.coverPlaceholder}><KindIcon size={36} /><span>{t(KIND_KEYS[item.kind])}</span></div>}
          </div>
          <div className={styles.railPanel}>
            <div className={styles.actions}>
              {item.external_source === "tmdb" || item.external_source === "openlibrary" ? <RefreshMovieButton itemId={item.id} /> : null}
              <ItemActions itemId={item.id} title={displayTitle} />
            </div>
            <dl className={styles.facts}>
              <div className={styles.fact}><dt>{t("item.status")}</dt><dd><Badge tone={STATUS_TONES[item.status]}>{t(statusKey(item.kind, item.status))}</Badge></dd></div>
              <div className={styles.fact}><dt>{t("item.rating")}</dt><dd>{item.rating ? <RatingStars label={t("item.ratingOf", { rating: item.rating })} size={14} value={item.rating} /> : "—"}</dd></div>
              {item.source_url ? <div className={styles.fact}><dt>{t("item.link")}</dt><dd><a className={styles.source} href={item.source_url} rel="noreferrer noopener" target="_blank">{t("item.link")} ↗</a></dd></div> : null}
              <div className={styles.fact}><dt>{t("item.added")}</dt><dd>{formatDateI18n(locale, item.created_at, { dateStyle: "medium" })}</dd></div>
              <div className={styles.fact}><dt>{t("item.changed")}</dt><dd>{formatDateI18n(locale, item.updated_at, { dateStyle: "medium" })}</dd></div>
              {item.deleted_at ? <div className={styles.fact}><dt>{t("card.deleted")}</dt><dd>{formatDate(item.deleted_at)}</dd></div> : null}
            </dl>
          </div>
        </aside>
        <div className={styles.main}>
          <ItemNeighbors nextHref={nextHref} prevHref={prevHref} />
          <KindDetails item={item} locale={locale} />
          {item.review || item.body || item.details ? <DetailGroup title={t("detail.myRecord")}>{item.review ? <ItemReview text={item.review} /> : null}{item.body ? <ItemReview text={item.body} title={t("item.privateNote")} /> : null}<RecordEditor item={item} /></DetailGroup> : null}
          {item.kind === "anime" || (item.kind === "tv" && item.details?.seasons && item.details.seasons.length > 0) ? <DetailGroup title={t("detail.progress")}><AnimeEpisodes item={item} />{item.kind === "tv" && item.details?.seasons && item.details.seasons.length > 0 ? <SeriesEpisodes itemId={item.id} seasons={item.details.seasons} totalEpisodes={item.details.number_of_episodes} watched={item.details.watched_episodes ?? []} initialSeason={continueSeason} highlightEpisode={continueEpisode} /> : null}</DetailGroup> : null}
          <AddToCollection itemId={item.id} />
          <DetailGroup title={t("detail.info")}>{item.details && (item.kind === "movie" || item.kind === "tv") ? <MovieCast details={item.details} locale={locale} /> : null}<SimilarItems itemId={item.id} /></DetailGroup>
        </div>
      </div>
    </main>
  );
}
