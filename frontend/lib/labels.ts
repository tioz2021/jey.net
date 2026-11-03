import type { ItemKind, ItemStatus, Sort } from "./types";

export const KIND_LABELS: Record<ItemKind, string> = {
  movie: "Фильм",
  book: "Книга",
  image: "Картинка",
  other: "Другое",
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  planned: "Запланировано",
  in_progress: "В процессе",
  done: "Готово",
  dropped: "Брошено",
};

/** Badge tone for each status; the components stay colour-agnostic. */
export const STATUS_TONES: Record<
  ItemStatus,
  "neutral" | "accent" | "success" | "warning" | "danger"
> = {
  planned: "accent",
  in_progress: "warning",
  done: "success",
  dropped: "neutral",
};

export const SORT_LABELS: Record<Sort, string> = {
  created_desc: "Сначала новые",
  created_asc: "Сначала старые",
  updated_desc: "Недавно изменённые",
  rating_desc: "По оценке",
  title_asc: "По названию",
  year_desc: "По году",
};
