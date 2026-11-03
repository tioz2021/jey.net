/** Alternates for the cookie-based locale: `?lang=` is picked up by middleware. */
export function languageAlternates(path: string) {
  return {
    ru: path,
    uk: `${path}?lang=uk`,
    en: `${path}?lang=en`,
  };
}
