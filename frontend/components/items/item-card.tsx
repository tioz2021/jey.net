"use client";

/* eslint-disable @next/next/no-img-element -- covers are ready-made WebP renditions */
import Link from "next/link";

import {
  IconBook,
  IconFilm,
  IconGame,
  IconImage,
  IconOther,
  IconTv,
} from "@/components/icons";
import { Badge } from "@/components/ui";
import { KIND_KEYS, statusKey } from "@/lib/i18n/labels";
import { localizedSubtitle, localizedTitle } from "@/lib/item-title";
import { RatingStars } from "@/components/items/rating-stars";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import { STATUS_TONES } from "@/lib/labels";
import type { ItemKind, ItemProgress, ItemStatus } from "@/lib/types";

import { CardReaction } from "./card-reaction";
import { ContinueLink } from "./continue-link";
import { RestoreButton } from "./restore-button";
import styles from "./item-card.module.css";

const KIND_ICONS = {
  movie: IconFilm,
  tv: IconTv,
  book: IconBook,
  game: IconGame,
  anime: IconTv,
  image: IconImage,
  other: IconOther,
} as const;

/** Marks the part of the title that matched the search. */
function Highlight({ text, query }: { text: string; query?: string }) {
  const needle = query?.trim().toLowerCase() ?? "";
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;

  if (!needle || index === -1) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark className={styles.mark}>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

/** Fields a card needs; `Item` satisfies this too. */
export interface ItemCardData {
  id: string;
  slug?: string;
  kind: ItemKind;
  title: string;
  subtitle: string | null;
  year: number | null;
  status: ItemStatus;
  rating: number | null;
  review: string | null;
  cover_key: string | null;
  deleted_at?: string | null;
  details?: {
    genres?: string[] | null;
    number_of_episodes?: number | null;
    watched_episodes?: Array<{ season_number: number; episode_number: number }> | null;
    seasons?: import("@/lib/types").SeasonSummary[] | null;
    runtime?: number | null;
    page_count?: number | null;
    anime_format?: string | null;
    platforms?: string[] | null;
    progress?: ItemProgress | null;
    last_action_at?: string | null;
    rewatch_count?: number | null;
    translations?: Record<
      string,
      {
        title?: string | null;
        director?: string | null;
        genres?: string[] | null;
      }
    > | null;
  } | null;
  titles?: Record<string, string> | null;
  directors?: Record<string, string> | null;
  genres?: Record<string, string[]> | null;
}

export function ItemCard({
  item,
  query,
  href,
  selected = false,
  reactions = false,
  showContinue = false,
  footer,
  onOpen,
  coverSrc,
}: {
  item: ItemCardData;
  query?: string;
  href?: string;
  selected?: boolean;
  reactions?: boolean;
  showContinue?: boolean;
  footer?: React.ReactNode;
  /** Desktop opens a local detail view instead of following a web route. */
  onOpen?: () => void;
  /** Explicit image source for clients with a local media cache. */
  coverSrc?: string;
}) {
  const { t, locale } = useI18n();
  const { user } = useUser();
  const target =
    href ??
    (user?.handle && item.slug
      ? `/u/${user.handle}/item/${item.slug}`
      : `/items/${item.id}`);
  const title = localizedTitle(item, locale);
  const subtitle = localizedSubtitle(item, locale);

  const watchedEpisodes = item.details?.watched_episodes?.length ?? 0;
  const progress = item.details?.progress;
  const kindFact =
    item.kind === "movie" && item.details?.runtime
      ? t("movie.minutes", { count: item.details.runtime })
      : item.kind === "book" && item.details?.page_count
        ? t("card.pages", { count: item.details.page_count })
        : item.kind === "anime" && item.details?.anime_format
          ? item.details.anime_format.toUpperCase()
          : item.kind === "anime" && item.details?.number_of_episodes
            ? t("card.episodes", { count: item.details.number_of_episodes })
            : (item.kind === "game" ? item.details?.platforms?.[0] : null);
  const progressTotal =
    progress?.total ??
    (item.kind === "anime"
      ? item.details?.number_of_episodes
      : item.kind === "book"
        ? (item.details as { page_count?: number | null } | null | undefined)?.page_count
        : null);
  const progressPercent =
    progress && progressTotal && progressTotal > 0
      ? Math.min(100, Math.round((progress.current / progressTotal) * 100))
      : null;
  const actionDate = item.details?.last_action_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
        new Date(item.details.last_action_at),
      )
    : null;
  const rewatches = item.details?.rewatch_count ?? 0;
  const PlaceholderIcon = KIND_ICONS[item.kind];
  const meta = [
    t(KIND_KEYS[item.kind]),
    item.year ? String(item.year) : null,
    kindFact || null,
  ].filter(Boolean);

  const card = (
    <article className={`${styles.card} ${selected ? styles.cardSelected : ""}`}>
      <div className={styles.poster}>
        {coverSrc ?? item.cover_key ? (
          <img
            className={styles.cover}
            src={coverSrc ?? `/media/${item.cover_key}`}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            <PlaceholderIcon size={28} />
            <span>{t(KIND_KEYS[item.kind])}</span>
          </div>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            <Highlight text={title} query={query} />
          </h2>
          <Badge tone={STATUS_TONES[item.status]}>
            {t(statusKey(item.kind, item.status))}
          </Badge>
        </div>

        {subtitle ? (
          <p className={styles.subtitle}>{subtitle}</p>
        ) : null}

        <p className={styles.meta}>{meta.join(" · ")}</p>

        {item.kind === "anime" || item.kind === "book" || item.kind === "game" ? (
          progress &&
          (item.kind === "book"
            ? progress.current > 0
            : progress.current > 0 || progressTotal) ? (
            <div className={styles.progress}>
              <span>
                {item.kind === "anime"
                  ? t("progress.episodesShort", {
                      current: progress.current,
                      total: progressTotal ?? "—",
                    })
                  : item.kind === "book"
                    ? t("progress.pagesShort", {
                        current: progress.current,
                        total: progressTotal ?? "—",
                      })
                    : t("progress.hoursShort", { current: progress.current })}
              </span>
              {progressPercent !== null ? (
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressBar}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null
        ) : null}

        {item.kind === "tv" && watchedEpisodes > 0 ? (
          <div className={styles.progress}>
            <span>
              {t("tvEpisodes.progress", {
                watched: watchedEpisodes,
                total: item.details?.number_of_episodes ?? "—",
              })}
            </span>
            {item.details?.number_of_episodes ? (
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (watchedEpisodes / item.details.number_of_episodes) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {item.rating ? (
          <div className={styles.rating}>
            <RatingStars
              compact
              label={t("item.ratingOf", { rating: item.rating })}
              value={item.rating}
            />
          </div>
        ) : null}

        {actionDate ? (
          <p className={styles.actionDate}>
            {t("card.lastAction", { date: actionDate })}
            {rewatches > 0
              ? ` · ${t("card.rewatched", { count: rewatches })}`
              : ""}
          </p>
        ) : null}

        {item.review ? <p className={styles.review}>{item.review}</p> : null}

        {item.deleted_at ? (
          <div className={styles.deleted}>
            <Badge tone="danger">{t("card.deleted")}</Badge>
            <RestoreButton itemId={item.id} />
          </div>
        ) : null}

        {footer || (showContinue && (item.kind === "tv" || item.kind === "anime")) ? (
          <div className={styles.cardFooter}>
            {footer}
            {showContinue && (item.kind === "tv" || item.kind === "anime") ? (
              <ContinueLink details={item.details} kind={item.kind} target={target} />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );

  if (item.deleted_at) {
    return card;
  }

  return (
    <div className={styles.cardWrap}>
      {card}
      {onOpen ? (
        <button
          aria-label={title}
          className={styles.cardLinkOverlay}
          onClick={onOpen}
          type="button"
        />
      ) : (
        <Link aria-label={title} className={styles.cardLinkOverlay} href={target} />
      )}
      {reactions ? (
        <div className={styles.reactionSlot}>
          <CardReaction itemId={item.id} />
        </div>
      ) : null}
    </div>
  );
}
