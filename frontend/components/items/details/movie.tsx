import { MovieCast } from "@/components/items/movie-cast";
import { MovieInfo } from "@/components/items/movie-info";
import type { Locale } from "@/lib/i18n";
import type { Item } from "@/lib/types";

export function MovieDetails({ item, locale }: { item: Item; locale: Locale }) {
  if (!item.details) return null;
  return (
    <>
      <MovieInfo details={item.details} kind="movie" locale={locale} tmdbId={item.external_source === "tmdb" ? item.external_id : null} />
      <MovieCast details={item.details} locale={locale} />
    </>
  );
}
