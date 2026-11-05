import type { Locale } from "@/lib/i18n";
import type { Item } from "@/lib/types";

import { AnimeDetails } from "./anime";
import { BookDetails } from "./book";
import { GameDetails } from "./game";
import { MovieDetails } from "./movie";
import { TvDetails } from "./tv";

/** One page shell, one component per kind. */
export function KindDetails({ item, locale }: { item: Item; locale: Locale }) {
  switch (item.kind) {
    case "movie":
      return <MovieDetails item={item} locale={locale} />;
    case "tv":
      return <TvDetails item={item} locale={locale} />;
    case "anime":
      return <AnimeDetails item={item} locale={locale} />;
    case "book":
      return <BookDetails item={item} locale={locale} />;
    case "game":
      return <GameDetails item={item} locale={locale} />;
    default:
      return null;
  }
}
