/** Canonical origin of the site, used by metadata, robots and the sitemap. */
export function siteUrl(): string {
  return process.env.PUBLIC_URL ?? "http://localhost:3000";
}
