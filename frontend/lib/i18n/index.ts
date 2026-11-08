import { en } from "./en";
import { ru } from "./ru";
import { uk } from "./uk";

export const SUPPORTED_LOCALES = ["ru", "uk", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TranslationKey = keyof typeof ru;

export const LOCALE_COOKIE = "jey_lang";
export const DEFAULT_LOCALE: Locale = "ru";

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  ru,
  uk,
  en,
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "ru" || value === "uk" || value === "en";
}

/** Picks a supported locale from an `Accept-Language` header. */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }

  const tags = acceptLanguage
    .split(",")
    .map((part) => part.trim().split(";")[0]?.trim().toLowerCase())
    .filter(Boolean);

  for (const tag of tags) {
    if (!tag) {
      continue;
    }
    const base = tag.split("-")[0];
    if (base === "ru" || base === "uk" || base === "en") {
      return base;
    }
  }

  return DEFAULT_LOCALE;
}

export function dictionaryFor(locale: Locale): Record<TranslationKey, string> {
  return DICTIONARIES[locale] ?? ru;
}

/** Replaces `{name}` placeholders in a translated string. */
export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  const template = dictionaryFor(locale)[key] ?? ru[key];

  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** BCP 47 tags for `Intl`. */
export function localeTag(locale: Locale): string {
  switch (locale) {
    case "uk":
      return "uk-UA";
    case "en":
      return "en-US";
    default:
      return "ru-RU";
  }
}

export interface PluralForms {
  one: string;
  few?: string;
  many?: string;
  other?: string;
}

/** CLDR plural rules for ru/uk/en. */
export function plural(
  locale: Locale,
  count: number,
  forms: PluralForms,
): string {
  const rule = new Intl.PluralRules(localeTag(locale)).select(count);

  switch (rule) {
    case "one":
      return forms.one;
    case "few":
      return forms.few ?? forms.many ?? forms.other ?? forms.one;
    case "many":
      return forms.many ?? forms.other ?? forms.one;
    default:
      return forms.other ?? forms.many ?? forms.one;
  }
}

export function formatDate(
  locale: Locale,
  value: Date | number | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "long" },
): string {
  // Local SQLite timestamps arrive as millisecond strings; the server uses
  // RFC 3339. Normalise both before handing them to Intl.
  const input =
    typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : value;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeTag(locale), options).format(date);
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

export function formatMoney(
  locale: Locale,
  value: number,
  currency = "USD",
): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
