import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";
import type {
  Item,
  ItemKind,
  ItemStatus,
  MovieDetails,
  NewItem,
} from "@/lib/types";

export const KINDS: ItemKind[] = ["movie", "tv", "book", "game", "anime"];
export const COMPACT_KINDS = new Set<ItemKind>(KINDS);

/** Films and pictures are noted instantly; only books and notes are "in progress". */
export const STATUS_BY_KIND: Record<ItemKind, ItemStatus[]> = {
  movie: ["planned", "done", "dropped"],
  tv: ["planned", "in_progress", "done", "dropped"],
  image: ["planned", "done", "dropped"],
  book: ["planned", "in_progress", "done", "dropped"],
  game: ["planned", "in_progress", "done", "dropped"],
  anime: ["planned", "in_progress", "done", "dropped"],
  other: ["planned", "in_progress", "done", "dropped"],
};

export const SUBTITLE_KEYS: Record<ItemKind, TranslationKey> = {
  movie: "form.subtitle.movie",
  tv: "form.subtitle.tv",
  book: "form.subtitle.book",
  game: "form.subtitle.game",
  anime: "form.subtitle.anime",
  image: "form.subtitle.image",
  other: "form.subtitle.other",
};

export type Field =
  | "title"
  | "subtitle"
  | "year"
  | "rating"
  | "review"
  | "body"
  | "source_url"
  | "form";

export type Errors = Partial<Record<Field, string>>;

export interface Values {
  kind: ItemKind;
  title: string;
  subtitle: string;
  year: string;
  status: ItemStatus;
  rating: string;
  review: string;
  body: string;
  source_url: string;
  external_source: string;
  external_id: string;
  details: MovieDetails | null;
  public_hidden: boolean;
  posterPath: string | null;
}

export const INITIAL: Values = {
  kind: "movie",
  title: "",
  subtitle: "",
  year: "",
  status: "done",
  rating: "",
  review: "",
  body: "",
  source_url: "",
  external_source: "",
  external_id: "",
  details: null,
  public_hidden: false,
  posterPath: null,
};

export function toValues(item?: Item, initialKind?: ItemKind): Values {
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
    body: item.body ?? "",
    source_url: item.source_url ?? "",
    external_source: item.external_source ?? "",
    external_id: item.external_id ?? "",
    details: item.details,
    public_hidden: item.public_hidden ?? false,
    posterPath: null,
  };
}

export function mergeDraft(base: Values, draft: Record<string, unknown> | null): Values {
  if (!draft || typeof draft !== "object") return base;
  const candidate = draft as Partial<Values>;
  if (typeof candidate.kind !== "string" || !KINDS.includes(candidate.kind as ItemKind)) {
    return base;
  }
  return {
    ...base,
    ...candidate,
    kind: candidate.kind,
    details: candidate.details ?? base.details,
  } as Values;
}

type TFunction = ReturnType<typeof useI18n>["t"];

function parseNumber(
  value: string,
  field: string,
  errors: Errors,
  t: TFunction,
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

export function validate(
  values: Values,
  t: TFunction,
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
  if (values.body.length > 20_000) {
    errors.body = t("validation.max20000");
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
      review: values.review.trim(),
      body: values.body.trim(),
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
