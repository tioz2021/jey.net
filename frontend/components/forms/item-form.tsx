"use client";

import { useAppRouter } from "@/lib/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { useI18n } from "@/lib/locale-context";
import type {
  Item,
  ItemKind,
  ItemStatus,
  BookDetailsResponse,
  MovieDetails,
  MovieDetailsResponse,
} from "@/lib/types";

import { useToast } from "@/components/toasts";
import { draftKey, readDraft, removeDraft, saveDraft } from "@/lib/local-draft";
import { ItemFormActions } from "./item-form-actions";
import { ItemFormFields } from "./item-form-fields";
import { ItemFormNotes } from "./item-form-notes";
import {
  COMPACT_KINDS,
  STATUS_BY_KIND,
  type Errors,
  type Field,
  type Values,
  mergeDraft,
  toValues,
  validate,
} from "./item-form-model";
import styles from "./item-form.module.css";

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
  const router = useAppRouter();
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const storageKey = draftKey(itemId);
  const initialDraft = readDraft(storageKey);
  const startKind = initial?.kind ?? lockKind ?? initialKind ?? "movie";
  const [values, setValues] = useState<Values>(() =>
    mergeDraft(toValues(initial, lockKind ?? initialKind), initialDraft?.values ?? null),
  );
  const [draftRestored] = useState(Boolean(initialDraft));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [coverUploadId, setCoverUploadId] = useState<string | null>(
    initialDraft?.coverUploadId ?? null,
  );
  const [coverPreview, setCoverPreview] = useState<string | null>(
    initialDraft?.coverPreview ?? null,
  );
  const [coverCleared, setCoverCleared] = useState(initialDraft?.coverCleared ?? false);
  const [posterPending, setPosterPending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [advanced, setAdvanced] = useState(
    () =>
      initialDraft?.advanced ??
      (Boolean(itemId) || !COMPACT_KINDS.has(startKind)),
  );

  const statuses = STATUS_BY_KIND[values.kind];

  useEffect(() => {
    const draft = {
      values: values as unknown as Record<string, unknown>,
      advanced,
      coverUploadId,
      coverPreview,
      coverCleared,
    };
    const timeout = window.setTimeout(() => saveDraft(storageKey, draft), 400);
    const flush = () => saveDraft(storageKey, draft);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [storageKey, values, advanced, coverUploadId, coverPreview, coverCleared]);

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field as Field]: undefined }));
  }

  function applyMovie(movie: MovieDetailsResponse) {
    setValues((current) => {
      const sameSeries =
        current.kind === "tv" &&
        current.external_source === "tmdb" &&
        current.external_id === String(movie.tmdb_id);
      return {
      ...current,
      title: movie.title,
      year: movie.year ? String(movie.year) : "",
      subtitle: movie.director ?? current.subtitle,
      source_url: "",
      external_source: "tmdb",
      external_id: String(movie.tmdb_id),
      posterPath: movie.poster_path,
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
        watched_episodes: sameSeries
          ? (current.details?.watched_episodes ?? [])
          : [],
      },
      };
    });
    setPosterPending(true);
    setCoverUploadId(null);
    setCoverPreview(null);
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
    setCoverPreview(null);
    setCoverCleared(false);
  }

  function applyAnime(anime: MovieDetails, animeId: string, source: string) {
    const prefix = animeId.split(":")[0] ?? "";
    const numericId = animeId.slice(prefix.length + 1);
    setValues((current) => ({
      ...current,
      title: anime.original_title,
      year: anime.release_date ? anime.release_date.slice(0, 4) : "",
      subtitle: (anime.companies ?? []).join(", "),
      source_url: source === "shikimori"
        ? `https://shikimori.one/animes/${numericId}`
        : `https://anilist.co/anime/${numericId}`,
      external_source: source,
      external_id: numericId,
      details: {
        ...anime,
        authors: [], publisher: null, cast: [],
        countries: [], languages: [], budget: null, revenue: null,
        imdb_id: null, translations: {}, number_of_seasons: null,
        seasons: [], watched_episodes: [],
      },
    }));
    setPosterPending(true); setCoverUploadId(null); setCoverCleared(false);
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
    setCoverPreview(null);
    setCoverCleared(false);
  }

  function changeKind(kind: ItemKind) {
    setValues((current) => {
      const switching = current.kind !== kind;
      const hadExternal = Boolean(current.external_id);
      return {
        ...current,
        kind,
        title: switching && hadExternal ? "" : current.title,
        subtitle: switching && hadExternal ? "" : current.subtitle,
        year: switching && hadExternal ? "" : current.year,
        source_url: switching && hadExternal ? "" : current.source_url,
        external_source: switching ? "" : current.external_source,
        external_id: switching ? "" : current.external_id,
        details: switching ? null : current.details,
        status: STATUS_BY_KIND[kind].includes(current.status)
          ? current.status
          : (STATUS_BY_KIND[kind][0] ?? "planned"),
      };
    });
    setErrors({});
    setPosterPending(false);
    setCoverUploadId(null);
    setCoverCleared(false);
    if (!COMPACT_KINDS.has(kind)) {
      setAdvanced(true);
    }
  }

  function clearForm() {
    setValues(toValues(initial, lockKind ?? initialKind));
    setErrors({});
    setCoverUploadId(null);
    setCoverPreview(null);
    setCoverCleared(false);
    setPosterPending(false);
    removeDraft(storageKey);
    setClearOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const compactMedia = !itemId && COMPACT_KINDS.has(values.kind) && !advanced;
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
      } else if ((posterPending || values.posterPath) && values.external_id) {
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

      removeDraft(storageKey);
      // The detail page fetches the record on the server; refreshing here
      // would race with the navigation and can keep the form's route.
      router.push(`/items/${savedId}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const field = error.field;
        if (field && field !== "kind" && field !== "status") {
          setErrors({ [field]: error.message });
        } else {
          setErrors({ form: error.message });
        }
      } else {
        setErrors({ form: t("error.fallbackText") });
        notifyError(error);
      }
      setSubmitting(false);
    }
  }

  const compactMedia = !itemId && COMPACT_KINDS.has(values.kind);
  const showExtra = !compactMedia || advanced;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {errors.form ? (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      ) : null}

      <ItemFormFields
        advanced={advanced}
        compactMedia={compactMedia}
        coverPreview={coverPreview}
        errors={errors}
        initial={initial}
        lockKind={lockKind}
        onAdvancedToggle={() => setAdvanced((value) => !value)}
        onAnime={applyAnime}
        onBook={applyBook}
        onCoverCleared={() => {
          setCoverUploadId(null);
          setCoverPreview(null);
          setCoverCleared(true);
          saveDraft(storageKey, {
            values: values as unknown as Record<string, unknown>,
            advanced,
            coverUploadId: null,
            coverPreview: null,
            coverCleared: true,
          });
        }}
        onCoverUploaded={(uploadId, preview) => {
          setCoverUploadId(uploadId);
          setCoverPreview(preview);
          setCoverCleared(false);
          // Save immediately: the user may reload before the debounce runs.
          saveDraft(storageKey, {
            values: values as unknown as Record<string, unknown>,
            advanced,
            coverUploadId: uploadId,
            coverPreview: preview,
            coverCleared: false,
          });
        }}
        onGame={applyGame}
        onKindChange={changeKind}
        onMovie={applyMovie}
        onUpdate={update}
        showExtra={showExtra}
        statuses={statuses}
        values={values}
      />

      <ItemFormNotes
        draftRestored={draftRestored}
        errors={errors}
        onUpdate={update}
        values={values}
      />

      <ItemFormActions
        clearOpen={clearOpen}
        itemId={itemId}
        onCancel={() => {
          removeDraft(storageKey);
          router.push("/items");
        }}
        onClear={clearForm}
        onClearClose={() => setClearOpen(false)}
        onClearOpen={() => setClearOpen(true)}
        submitting={submitting}
      />
    </form>
  );
}
