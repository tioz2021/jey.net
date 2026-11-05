import type { TranslationKey } from "./index";
import type { ItemKind, ItemStatus, Sort } from "@/lib/types";

export const KIND_KEYS: Record<ItemKind, TranslationKey> = {
  movie: "kind.movie",
  tv: "kind.tv",
  book: "kind.book",
  game: "kind.game",
  anime: "kind.anime",
  image: "kind.image",
  other: "kind.other",
};

export const STATUS_KEYS: Record<ItemStatus, TranslationKey> = {
  planned: "status.planned",
  in_progress: "status.in_progress",
  done: "status.done",
  dropped: "status.dropped",
};

/** Human statuses that differ from the neutral fallback. */
export const STATUS_KEYS_BY_KIND: Record<
  ItemKind,
  Partial<Record<ItemStatus, TranslationKey>>
> = {
  movie: {
    planned: "status.movie.planned",
    done: "status.movie.done",
  },
  tv: {
    planned: "status.tv.planned",
    in_progress: "status.tv.in_progress",
    done: "status.tv.done",
  },
  anime: {
    planned: "status.anime.planned",
    in_progress: "status.anime.in_progress",
    done: "status.anime.done",
  },
  book: {
    planned: "status.book.planned",
    in_progress: "status.book.in_progress",
    done: "status.book.done",
  },
  game: {
    planned: "status.game.planned",
    in_progress: "status.game.in_progress",
    done: "status.game.done",
  },
  image: {},
  other: {},
};

export const STATUSES_BY_KIND: Record<ItemKind, ItemStatus[]> = {
  movie: ["planned", "done", "dropped"],
  tv: ["planned", "in_progress", "done", "dropped"],
  anime: ["planned", "in_progress", "done", "dropped"],
  book: ["planned", "in_progress", "done", "dropped"],
  game: ["planned", "in_progress", "done", "dropped"],
  image: ["planned", "done", "dropped"],
  other: ["planned", "in_progress", "done", "dropped"],
};

/** The label for a status in the context of a concrete record kind. */
export function statusKey(
  kind: ItemKind | null | undefined,
  status: ItemStatus,
): TranslationKey {
  return kind && STATUS_KEYS_BY_KIND[kind]?.[status]
    ? STATUS_KEYS_BY_KIND[kind][status]!
    : STATUS_KEYS[status];
}

export const SORT_KEYS: Record<Sort, TranslationKey> = {
  created_desc: "sort.created_desc",
  created_asc: "sort.created_asc",
  updated_desc: "sort.updated_desc",
  rating_desc: "sort.rating_desc",
  title_asc: "sort.title_asc",
  year_desc: "sort.year_desc",
};
