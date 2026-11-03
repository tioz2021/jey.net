"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  dictionaryFor,
  formatDate as formatDateFor,
  formatMoney as formatMoneyFor,
  formatNumber as formatNumberFor,
  LOCALE_COOKIE,
  localeTag,
  plural as pluralFor,
  translate,
  type Locale,
  type PluralForms,
  type TranslationKey,
} from "./i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  date: (
    value: Date | number | string,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  number: (value: number) => string;
  money: (value: number, currency?: string) => string;
  plural: (count: number, forms: PluralForms) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function persist(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;

    if (!document.cookie.includes(`${LOCALE_COOKIE}=`)) {
      persist(locale);
    }
  }, [locale]);

  // A server refresh may bring a different locale (cookie/profile).
  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    document.documentElement.dataset.locale = next;
    persist(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
      date: (input, options) => formatDateFor(locale, input, options),
      number: (input) => formatNumberFor(locale, input),
      money: (input, currency) => formatMoneyFor(locale, input, currency),
      plural: (count, forms) => pluralFor(locale, count, forms),
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useI18n(): LocaleContextValue {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useI18n must be used inside LocaleProvider");
  }

  return context;
}

export function useLocaleTag(): string {
  return localeTag(useI18n().locale);
}

export function useDictionary(): Record<TranslationKey, string> {
  return dictionaryFor(useI18n().locale);
}
