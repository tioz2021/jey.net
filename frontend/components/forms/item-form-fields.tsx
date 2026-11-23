"use client";

import { Input, Select } from "@/components/ui";
import { AnimeSearch } from "@/components/items/anime-search";
import { BookSearch } from "@/components/items/book-search";
import { CoverPicker } from "@/components/items/cover-picker";
import { GameSearch } from "@/components/items/game-search";
import { MovieSearch } from "@/components/items/movie-search";
import { KIND_KEYS, statusKey } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import { mediaUrl } from "@/lib/media";
import type {
  BookDetailsResponse,
  Item,
  ItemKind,
  ItemStatus,
  MovieDetails,
  MovieDetailsResponse,
} from "@/lib/types";

import {
  KINDS,
  SUBTITLE_KEYS,
  type Errors,
  type Values,
} from "./item-form-model";
import styles from "./item-form.module.css";

export interface ItemFormFieldsProps {
  values: Values;
  errors: Errors;
  statuses: ItemStatus[];
  lockKind?: ItemKind;
  advanced: boolean;
  showExtra: boolean;
  compactMedia: boolean;
  initial?: Item;
  coverPreview: string | null;
  onUpdate: <K extends keyof Values>(field: K, value: Values[K]) => void;
  onKindChange: (kind: ItemKind) => void;
  onAdvancedToggle: () => void;
  onMovie: (movie: MovieDetailsResponse) => void;
  onBook: (book: BookDetailsResponse) => void;
  onAnime: (anime: MovieDetails, animeId: string, source: string) => void;
  onGame: (game: MovieDetails, igdbId: number) => void;
  onCoverUploaded: (uploadId: string, preview: string | null) => void;
  onCoverCleared: () => void;
}

export function ItemFormFields({
  values,
  errors,
  statuses,
  lockKind,
  advanced,
  showExtra,
  compactMedia,
  initial,
  coverPreview,
  onUpdate,
  onKindChange,
  onAdvancedToggle,
  onMovie,
  onBook,
  onAnime,
  onGame,
  onCoverUploaded,
  onCoverCleared,
}: ItemFormFieldsProps) {
  const { t } = useI18n();
  const posterUrl = coverPreview ?? (initial?.cover_key ? mediaUrl(initial.cover_key) : null);

  return (
    <>
      <div className={`${styles.row} ${lockKind ? styles.single : ""}`}>
        {lockKind ? null : (
          <Select
            label={t("form.kind")}
            value={values.kind}
            onChange={(event) => onKindChange(event.target.value as ItemKind)}
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(KIND_KEYS[value])}
              </option>
            ))}
          </Select>
        )}

        <Select
          label={t("form.status")}
          value={values.status}
          onChange={(event) => onUpdate("status", event.target.value as ItemStatus)}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {t(statusKey(values.kind, status))}
            </option>
          ))}
        </Select>
      </div>

      {values.kind === "movie" || values.kind === "tv" ? (
        <MovieSearch
          media={values.kind === "tv" ? "tv" : "movie"}
          onSelect={onMovie}
          selected={values.external_id ? values.title : null}
          selectedDirector={values.subtitle || undefined}
          selectedPosterUrl={posterUrl}
          selectedPosterPath={values.posterPath}
          selectedYear={values.year || undefined}
        />
      ) : null}

      {values.kind === "book" ? (
        <BookSearch
          onSelect={onBook}
          selected={values.external_id ? values.title : null}
          selectedAuthors={values.subtitle || undefined}
          selectedCoverId={values.details?.cover_id ?? null}
          selectedCoverUrl={values.details?.cover_url ?? null}
        />
      ) : null}

      {values.kind === "anime" ? (
        <AnimeSearch
          onSelect={onAnime}
          selected={values.external_id ? values.title : null}
          selectedMeta={(values.details?.anime_format ?? undefined) as string | undefined}
          selectedCoverUrl={values.details?.cover_url ?? null}
        />
      ) : null}

      {values.kind === "game" ? (
        <GameSearch
          onSelect={onGame}
          selected={values.external_id ? values.title : null}
          selectedPlatforms={(values.details?.platforms ?? []).join(", ") || undefined}
          selectedCoverUrl={values.details?.cover_url ?? null}
        />
      ) : null}

      {compactMedia ? (
      <div className={styles.advanced}>
        <button
          aria-expanded={advanced}
          className={styles.advancedToggle}
          onClick={onAdvancedToggle}
          type="button"
        >
          <span>{advanced ? t("form.advancedHide") : t("form.advanced")}</span>
          <span aria-hidden="true">{advanced ? "▴" : "▾"}</span>
        </button>
        {!advanced ? <p className={styles.advancedHint}>{t("form.advancedHint")}</p> : null}
      </div>
      ) : null}

      {showExtra ? (
        <>
          <Input
            label={t("form.title")}
            value={values.title}
            onChange={(event) => onUpdate("title", event.target.value)}
            error={errors.title}
            required
          />

          <div className={styles.row}>
            <Input
              label={t(SUBTITLE_KEYS[values.kind])}
              value={values.subtitle}
              onChange={(event) => onUpdate("subtitle", event.target.value)}
              error={errors.subtitle}
            />

            <Input
              label={t("form.year")}
              inputMode="numeric"
              value={values.year}
              onChange={(event) => onUpdate("year", event.target.value)}
              error={errors.year}
            />
          </div>

          <Input
            label={t("form.link")}
            type="url"
            placeholder="https://"
            value={values.source_url}
            onChange={(event) => onUpdate("source_url", event.target.value)}
            error={errors.source_url}
          />

          <label className={styles.checkbox}>
            <input
              checked={values.public_hidden}
              onChange={(event) => onUpdate("public_hidden", event.target.checked)}
              type="checkbox"
            />
            {t("form.hidePublic")}
          </label>

          <CoverPicker
            currentUrl={posterUrl}
            onUploaded={onCoverUploaded}
            onCleared={onCoverCleared}
          />
        </>
      ) : null}
    </>
  );
}
