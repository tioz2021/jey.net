"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { KIND_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";
import type {
  Item,
  ItemKind,
  ItemStatus,
  BookDetailsResponse,
  MovieDetails,
  MovieDetailsResponse,
  NewItem,
} from "@/lib/types";

import { CoverPicker } from "@/components/items/cover-picker";
import { StarRating } from "@/components/forms/star-rating";
import { BookSearch } from "@/components/items/book-search";
import { GameSearch } from "@/components/items/game-search";
import { MovieSearch } from "@/components/items/movie-search";
import { useToast } from "@/components/toasts";
import styles from "./item-form.module.css";

const KINDS = Object.keys(KIND_KEYS) as ItemKind[];

/** Films and pictures are noted instantly; only books and notes are "in progress". */
const STATUS_BY_KIND: Record<ItemKind, ItemStatus[]> = {
  movie: ["planned", "done", "dropped"],
  tv: ["planned", "in_progress", "done", "dropped"],
  image: ["planned", "done", "dropped"],
  book: ["planned", "in_progress", "done", "dropped"],
  game: ["planned", "in_progress", "done", "dropped"],
  other: ["planned", "in_progress", "done", "dropped"],
};

const SUBTITLE_KEYS: Record<ItemKind, TranslationKey> = {
  movie: "form.subtitle.movie",
  tv: "form.subtitle.tv",
  book: "form.subtitle.book",
  game: "form.subtitle.game",
  image: "form.subtitle.image",
  other: "form.subtitle.other",
};

type Field =
  | "title"
  | "subtitle"
  | "year"
  | "rating"
  | "review"
  | "source_url"
  | "form";

type Errors = Partial<Record<Field, string>>;

interface Values {
  kind: ItemKind;
  title: string;
  subtitle: string;
  year: string;
  status: ItemStatus;
  rating: string;
  review: string;
  source_url: string;
  external_source: string;
  external_id: string;
  details: MovieDetails | null;
  public_hidden: boolean;
}

const INITIAL: Values = {
  kind: "movie",
  title: "",
  subtitle: "",
  year: "",
  status: "done",
  rating: "",
  review: "",
  source_url: "",
  external_source: "",
  external_id: "",
  details: null,
  public_hidden: false,
};

function toValues(item?: Item, initialKind?: ItemKind): Values {
  if (!item) {
    return { ...INITIAL, kind: initialKind ?? INITIAL.kind };
  }

  return {
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle ?? "",
    year: item.year === null ? "" : String(item.year),
    status: item.status,
    rating: item.rating === null ? "" : String(item.rating),
    review: item.review ?? "",
    source_url: item.source_url ?? "",
    external_source: item.external_source ?? "",
    external_id: item.external_id ?? "",
    details: item.details,
    public_hidden: item.public_hidden ?? false,
  };
}

function parseNumber(
  value: string,
  field: string,
  errors: Errors,
  t: ReturnType<typeof useI18n>["t"],
): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    errors[field as Field] = t("validation.integer");
    return null;
  }

  return parsed;
}

function validate(
  values: Values,
  t: ReturnType<typeof useI18n>["t"],
): { errors: Errors; item?: NewItem } {
  const errors: Errors = {};

  const title = values.title.trim();
  if (!title) {
    errors.title = t("validation.titleRequired");
  } else if (title.length > 300) {
    errors.title = t("validation.max300");
  }

  const subtitle = values.subtitle.trim();
  if (subtitle.length > 300) {
    errors.subtitle = t("validation.max300");
  }

  const year = parseNumber(values.year, "year", errors, t);
  if (year !== null && (year < 1800 || year > 2100)) {
    errors.year = t("validation.yearRange");
  }

  const rating = parseNumber(values.rating, "rating", errors, t);
  if (rating !== null && (rating < 1 || rating > 10)) {
    errors.rating = t("validation.ratingRange");
  }

  if (values.review.length > 20_000) {
    errors.review = t("validation.max20000");
  }

  const sourceUrl = values.source_url.trim();
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
    errors.source_url = t("validation.url");
  } else if (sourceUrl.length > 2048) {
    errors.source_url = t("validation.max2048");
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors,
    item: {
      kind: values.kind,
      title,
      subtitle: subtitle || null,
      year,
      status: values.status,
      rating,
      review: values.review.trim() || null,
      source_url: sourceUrl || null,
      external_source: values.external_id
        ? values.external_source || "tmdb"
        : null,
      external_id: values.external_id || null,
      details: values.details,
      public_hidden: values.public_hidden,
    },
  };
}


export function ItemForm({
  initial,
  itemId,
  initialKind,
  lockKind,
}: {
  initial?: Item;
  itemId?: string;
  initialKind?: ItemKind;
  lockKind?: ItemKind;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const [values, setValues] = useState<Values>(() =>
    toValues(initial, lockKind ?? initialKind),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [coverUploadId, setCoverUploadId] = useState<string | null>(null);
  const [coverCleared, setCoverCleared] = useState(false);
  const [posterPending, setPosterPending] = useState(false);
  const startKind = initial?.kind ?? lockKind ?? initialKind ?? "movie";
  const [advanced, setAdvanced] = useState(
    () =>
      Boolean(itemId) ||
      (startKind !== "movie" &&
        startKind !== "tv" &&
        startKind !== "book" &&
        startKind !== "game"),
  );

  const statuses = STATUS_BY_KIND[values.kind];

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field as Field]: undefined }));
  }

  function applyMovie(movie: MovieDetailsResponse) {
    setValues((current) => ({
      ...current,
      title: movie.title,
      year: movie.year ? String(movie.year) : "",
      subtitle: movie.director ?? current.subtitle,
      external_source: "tmdb",
      external_id: String(movie.tmdb_id),
      details: {
        original_title: movie.original_title,
        overview: movie.overview,
        tagline: movie.tagline,
        runtime: movie.runtime,
        release_date: movie.release_date,
        status: movie.status,
        director: movie.director,
        cast: movie.cast,
        genres: movie.genres,
        countries: movie.countries,
        languages: movie.languages,
        companies: movie.companies,
        budget: movie.budget,
        revenue: movie.revenue,
        imdb_id: movie.imdb_id,
        vote_average_tenths: movie.vote_average_tenths,
        vote_count: movie.vote_count,
        translations: movie.translations,
        number_of_seasons: movie.number_of_seasons,
        number_of_episodes: movie.number_of_episodes,
        seasons: movie.seasons,
      },

    }));
    setPosterPending(true);
    setCoverUploadId(null);
    setCoverCleared(false);
  }

  function applyBook(book: BookDetailsResponse) {
    const authorLine = book.authors.join(", ");
    setValues((current) => ({
      ...current,
      title: book.title,
      year: book.year ? String(book.year) : "",
      subtitle: authorLine,
      source_url:
        book.source === "googlebooks"
          ? `https://books.google.com/books?id=${encodeURIComponent(book.book_id.replace(/^gb:/, ""))}`
          : `https://openlibrary.org/works/${book.book_id}`,
      external_source: book.source,
      external_id: book.book_id,
      details: {
        original_title: book.title,
        overview: book.overview,
        tagline: null,
        runtime: null,
        release_date: book.year ? `${book.year}-01-01` : null,
        status: null,
        director: authorLine || null,
        authors: book.authors,
        publisher: book.publisher,
        page_count: book.page_count,
        isbn: book.isbn,
        cover_id: book.cover_id,
        cover_url: book.cover_url,
        cast: [],
        genres: book.subjects,
        countries: [],
        languages: [],
        companies: [],
        budget: null,
        revenue: null,
        imdb_id: null,
        vote_average_tenths: null,
        vote_count: null,
        translations: {},
        number_of_seasons: null,
        number_of_episodes: null,
        seasons: [],
        watched_episodes: [],
      },

    }));
    setPosterPending(true);
    setCoverUploadId(null);
    setCoverCleared(false);
  }

  function applyGame(game: MovieDetails, igdbId: number) {
    const developerLine = (game.developers ?? []).join(", ");
    setValues((current) => ({
      ...current,
      title: game.original_title,
      year: game.release_date ? game.release_date.slice(0, 4) : "",
      subtitle: developerLine,
      source_url: "",
      external_source: "igdb",
      external_id: String(igdbId),
      details: {
        ...game,
        original_title: game.original_title,
        authors: [],
        publisher: game.publishers?.[0] ?? null,
        cast: [],
        countries: [],
        languages: [],
        companies: [],
        budget: null,
        revenue: null,
        imdb_id: null,
        translations: {},
        number_of_seasons: null,
        number_of_episodes: null,
        seasons: [],
        watched_episodes: [],
      },
    }));
    setPosterPending(true);
    setCoverUploadId(null);
    setCoverCleared(false);
  }

  function changeKind(kind: ItemKind) {
    setValues((current) => ({
      ...current,
      kind,
      // A status that does not exist for the new kind would be rejected by
      // the server, so fall back to the first allowed one.
      status: STATUS_BY_KIND[kind].includes(current.status)
        ? current.status
        : (STATUS_BY_KIND[kind][0] ?? "planned"),
    }));

    // Books and images need the full form; films and series stay compact.
    if (kind !== "movie" && kind !== "tv" && kind !== "book" && kind !== "game") {
      setAdvanced(true);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const compactMedia =
      !itemId &&
      (values.kind === "movie" ||
        values.kind === "tv" ||
        values.kind === "book" ||
        values.kind === "game") &&
      !advanced;
    if (compactMedia && !values.title.trim()) {
      setErrors({ form: t("form.movieRequired") });
      return;
    }

    const result = validate(values, t);
    setErrors(result.errors);
    if (!result.item) {
      return;
    }

    setSubmitting(true);
    try {
      const response = itemId
        ? await api.items.update(itemId, result.item)
        : await api.items.create(result.item);

      const savedId = response.item.id;

      if (coverUploadId) {
        await api.items.setCover(savedId, coverUploadId);
      } else if (coverCleared && itemId) {
        await api.items.clearCover(itemId);
      } else if (posterPending && values.external_id) {
        // A missing poster must never block saving the record itself.
        try {
          await api.items.setPoster(savedId);
        } catch {
          // The form still saves; the cover can be added later.
          notify({
            tone: "info",
            title: t("item.refreshFailed"),
            text: t("item.refreshFailedText"),
            requestId: null,
          });
        }
      }

      // The detail page fetches the record on the server; refreshing here
      // would race with the navigation and can keep the form's route.
      router.push(`/items/${savedId}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const field = error.field;
        if (field && field !== "kind" && field !== "status") {
          setErrors({ [field]: error.message });
        } else {
          notifyError(error);
        }
      } else {
        notifyError(error);
      }
      setSubmitting(false);
    }
  }

  const compactMedia =
    !itemId &&
    (values.kind === "movie" ||
      values.kind === "tv" ||
      values.kind === "book" ||
      values.kind === "game");
  const submitError =
    errors.form ?? Object.values(errors).find(Boolean);
  const showExtra = !compactMedia || advanced;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {lockKind && !showExtra ? null : (
      <div
        className={`${styles.row} ${
          showExtra || lockKind ? "" : styles.single
        }`}
      >
        {lockKind ? null : (
          <Select
            label={t("form.kind")}
            value={values.kind}
            onChange={(event) => changeKind(event.target.value as ItemKind)}
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(KIND_KEYS[value])}
              </option>
            ))}
          </Select>
        )}

        {showExtra ? (
          <Select
            label={t("form.status")}
            value={values.status}
            onChange={(event) =>
              update("status", event.target.value as ItemStatus)
            }
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {t(STATUS_KEYS[status])}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      )}

      {values.kind === "movie" || values.kind === "tv" ? (
        <MovieSearch
          media={values.kind === "tv" ? "tv" : "movie"}
          onSelect={applyMovie}
          selected={values.external_id ? values.title : null}
          selectedDirector={values.subtitle || undefined}
          selectedPosterUrl={
            initial?.cover_key ? `/media/${initial.cover_key}` : null
          }
          selectedYear={values.year || undefined}
        />
      ) : null}

      {values.kind === "book" ? (
        <BookSearch
          onSelect={applyBook}
          selected={values.external_id ? values.title : null}
          selectedAuthors={values.subtitle || undefined}
          selectedCoverId={values.details?.cover_id ?? null}
          selectedCoverUrl={values.details?.cover_url ?? null}
        />
      ) : null}

      {values.kind === "game" ? (
        <GameSearch
          onSelect={applyGame}
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
            onClick={() => setAdvanced((value) => !value)}
            type="button"
          >
            <span>
              {advanced ? t("form.advancedHide") : t("form.advanced")}
            </span>
            <span aria-hidden="true">{advanced ? "▴" : "▾"}</span>
          </button>
          {!advanced ? (
            <p className={styles.advancedHint}>{t("form.advancedHint")}</p>
          ) : null}
        </div>
      ) : null}

      {showExtra ? (
        <>
          <Input
            label={t("form.title")}
            value={values.title}
            onChange={(event) => update("title", event.target.value)}
            error={errors.title}
            required
          />

          <div className={styles.row}>
            <Input
              label={t(SUBTITLE_KEYS[values.kind])}
              value={values.subtitle}
              onChange={(event) => update("subtitle", event.target.value)}
              error={errors.subtitle}
            />

            <Input
              label={t("form.year")}
              inputMode="numeric"
              value={values.year}
              onChange={(event) => update("year", event.target.value)}
              error={errors.year}
            />
          </div>

          <Input
            label={t("form.link")}
            type="url"
            placeholder="https://"
            value={values.source_url}
            onChange={(event) => update("source_url", event.target.value)}
            error={errors.source_url}
          />

          <label className={styles.checkbox}>
            <input
              checked={values.public_hidden}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  public_hidden: event.target.checked,
                }))
              }
              type="checkbox"
            />
            {t("form.hidePublic")}
          </label>

          <CoverPicker
            currentUrl={
              initial?.cover_key ? `/media/${initial.cover_key}` : null
            }
            onUploaded={(uploadId) => {
              setCoverUploadId(uploadId);
              setCoverCleared(false);
            }}
            onCleared={() => {
              setCoverUploadId(null);
              setCoverCleared(true);
            }}
          />
        </>
      ) : null}

      <StarRating
        label={t("form.rating")}
        hint={t("form.ratingHint")}
        value={values.rating}
        onChange={(rating) => update("rating", rating)}
        error={errors.rating}
      />

      <Textarea
        label={t("form.note")}
        hint={t("form.noteHint")}
        rows={5}
        value={values.review}
        onChange={(event) => update("review", event.target.value)}
        error={errors.review}
      />

      {errors.form ? (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      ) : null}

      {submitError && !errors.title && !errors.subtitle ? (
        <p className={styles.formError} role="alert">
          {submitError}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button type="submit" loading={submitting}>
          {itemId ? t("form.update") : t("form.save")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push("/items")}
          disabled={submitting}
        >
          {t("form.cancel")}
        </Button>
      </div>
    </form>
  );
}
