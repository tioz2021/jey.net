import type { Locale } from "@/lib/i18n";

interface Translation {
  title?: string | null;
  director?: string | null;
  genres?: string[] | null;
}

interface Localizable {
  title: string;
  subtitle?: string | null;
  kind?: string;
  tags?: string[];
  details?: {
    genres?: string[] | null;
    translations?: Record<string, Translation> | null;
  } | null;
  titles?: Record<string, string> | null;
  directors?: Record<string, string> | null;
  genres?: Record<string, string[]> | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Prefers the TMDB title in the interface language. A manually renamed record
 * keeps its own title: it is not one of the known translations.
 */
export function localizedTitle(source: Localizable, locale: Locale): string {
  if (source.kind && source.kind !== "movie") {
    return source.title;
  }

  const titles: Record<string, string> = {};
  for (const [code, translation] of Object.entries(
    source.details?.translations ?? {},
  )) {
    if (clean(translation.title)) {
      titles[code] = clean(translation.title) as string;
    }
  }
  for (const [code, title] of Object.entries(source.titles ?? {})) {
    if (clean(title)) {
      titles[code] = clean(title) as string;
    }
  }

  const known = new Set(Object.values(titles));
  if (known.size > 0 && !known.has(source.title.trim())) {
    return source.title;
  }

  return titles[locale] ?? source.title;
}

/** Director from the localized snapshot; the author's own subtitle wins. */
export function localizedSubtitle(
  source: Localizable,
  locale: Locale,
): string | null {
  if (source.kind && source.kind !== "movie") {
    return source.subtitle ?? null;
  }

  const directors: Record<string, string> = {};
  for (const [code, translation] of Object.entries(
    source.details?.translations ?? {},
  )) {
    if (clean(translation.director)) {
      directors[code] = clean(translation.director) as string;
    }
  }
  for (const [code, director] of Object.entries(source.directors ?? {})) {
    if (clean(director)) {
      directors[code] = clean(director) as string;
    }
  }

  const subtitle = source.subtitle?.trim();
  const known = new Set(Object.values(directors));

  if (!subtitle) {
    return directors[locale] ?? source.subtitle ?? null;
  }
  if (!known.has(subtitle)) {
    return source.subtitle ?? null;
  }

  return directors[locale] ?? source.subtitle ?? null;
}

/** Genres act as tags after TMDB import; custom tags stay untouched. */
export function localizedTags(source: Localizable, locale: Locale): string[] {
  const tags = source.tags ?? [];
  if (source.kind && source.kind !== "movie") {
    return tags;
  }

  const byLocale: Record<string, string[]> = {};
  for (const [code, translation] of Object.entries(
    source.details?.translations ?? {},
  )) {
    if (translation.genres && translation.genres.length > 0) {
      byLocale[code] = translation.genres;
    }
  }
  for (const [code, genres] of Object.entries(source.genres ?? {})) {
    if (genres.length > 0) {
      byLocale[code] = genres;
    }
  }

  const target = byLocale[locale] ?? byLocale.en ?? byLocale.ru;
  if (!target) {
    return tags;
  }

  const arrays = Object.values(byLocale);
  if (source.details?.genres && source.details.genres.length > 0) {
    arrays.push(source.details.genres);
  }

  return tags.map((tag) => {
    const needle = tag.trim().toLowerCase();
    for (const genres of arrays) {
      const index = genres.findIndex(
        (genre) => genre.trim().toLowerCase() === needle,
      );
      if (index >= 0 && target[index]) {
        return target[index];
      }
    }
    return tag;
  });
}
