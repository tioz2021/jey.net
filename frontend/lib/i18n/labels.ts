import type { TranslationKey } from "./index";
import type { ItemKind, ItemStatus, Sort } from "@/lib/types";

export const KIND_KEYS: Record<ItemKind, TranslationKey> = {
  movie: "kind.movie",
  tv: "kind.tv",
  book: "kind.book",
  game: "kind.game",
  image: "kind.image",
  other: "kind.other",
};

export const STATUS_KEYS: Record<ItemStatus, TranslationKey> = {
  planned: "status.planned",
  in_progress: "status.in_progress",
  done: "status.done",
  dropped: "status.dropped",
};

export const SORT_KEYS: Record<Sort, TranslationKey> = {
  created_desc: "sort.created_desc",
  created_asc: "sort.created_asc",
  updated_desc: "sort.updated_desc",
  rating_desc: "sort.rating_desc",
  title_asc: "sort.title_asc",
  year_desc: "sort.year_desc",
};
