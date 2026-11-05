import { MovieInfo } from "@/components/items/movie-info";
import type { Locale } from "@/lib/i18n";
import type { Item } from "@/lib/types";

export function AnimeDetails({ item, locale }: { item: Item; locale: Locale }) {
  if (!item.details) return null;
  return (
    <MovieInfo details={item.details} kind="anime" locale={locale} tmdbId={null} />
  );
}
