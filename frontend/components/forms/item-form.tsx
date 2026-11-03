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
  MovieDetails,
  MovieDetailsResponse,
  NewItem,
} from "@/lib/types";

import { CoverPicker } from "@/components/items/cover-picker";
import { MovieSearch } from "@/components/items/movie-search";
import { TagInput } from "@/components/items/tag-input";
import { useToast } from "@/components/toasts";
import styles from "./item-form.module.css";

const KINDS = Object.keys(KIND_KEYS) as ItemKind[];

/** Films and pictures are noted instantly; only books and notes are "in progress". */
const STATUS_BY_KIND: Record<ItemKind, ItemStatus[]> = {
  movie: ["planned", "done", "dropped"],
  image: ["planned", "done", "dropped"],
  book: ["planned", "in_progress", "done", "dropped"],
  other: ["planned", "in_progress", "done", "dropped"],
};

const SUBTITLE_KEYS: Record<ItemKind, TranslationKey> = {
  movie: "form.subtitle.movie",
  book: "form.subtitle.book",
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
  | "tags"
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
  tags: string[];
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
  tags: [],
};

function toValues(item?: Item): Values {
  if (!item) {
    return INITIAL;
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
    tags: [...item.tags],
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
      external_source: values.external_id ? "tmdb" : null,
      external_id: values.external_id || null,
      details: values.details,
      tags: values.tags,
    },
  };
}

function mergeTags(current: string[], incoming: string[]): string[] {
  const seen = new Set(current.map((tag) => tag.toLowerCase()));
  const merged = [...current];

  for (const tag of incoming) {
    const key = tag.trim().toLowerCase();
    if (key && !seen.has(key) && merged.length < 20) {
      seen.add(key);
      merged.push(tag.trim());
    }
  }

  return merged;
}

export function ItemForm({
  initial,
  itemId,
}: {
  initial?: Item;
  itemId?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [coverUploadId, setCoverUploadId] = useState<string | null>(null);
  const [coverCleared, setCoverCleared] = useState(false);
  const [posterPending, setPosterPending] = useState(false);

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
      },
      tags: mergeTags(current.tags, movie.genres),
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
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
            title: "Постер не загрузился",
            text: "Запись сохранена — обложку можно добавить вручную.",
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

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.row}>
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

        <Select
          label={t("form.status")}
          value={values.status}
          onChange={(event) => update("status", event.target.value as ItemStatus)}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {t(STATUS_KEYS[status])}
            </option>
          ))}
        </Select>
      </div>

      {values.kind === "movie" ? (
        <MovieSearch
          onSelect={applyMovie}
          selected={values.external_id ? values.title : null}
        />
      ) : null}

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

      <div className={styles.row}>
        <Input
          label={t("form.rating")}
          inputMode="numeric"
          hint={t("form.ratingHint")}
          value={values.rating}
          onChange={(event) => update("rating", event.target.value)}
          error={errors.rating}
        />

        <Input
          label={t("form.link")}
          type="url"
          placeholder="https://"
          value={values.source_url}
          onChange={(event) => update("source_url", event.target.value)}
          error={errors.source_url}
        />
      </div>

      <Textarea
        label={t("form.note")}
        hint={t("form.noteHint")}
        rows={5}
        value={values.review}
        onChange={(event) => update("review", event.target.value)}
        error={errors.review}
      />

      <TagInput
        tags={values.tags}
        onChange={(tags) => update("tags", tags)}
        error={errors.tags}
      />

      <CoverPicker
        currentUrl={initial?.cover_key ? `/media/${initial.cover_key}` : null}
        onUploaded={(uploadId) => {
          setCoverUploadId(uploadId);
          setCoverCleared(false);
        }}
        onCleared={() => {
          setCoverUploadId(null);
          setCoverCleared(true);
        }}
      />

      {errors.form ? (
        <p className={styles.formError} role="alert">
          {errors.form}
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
