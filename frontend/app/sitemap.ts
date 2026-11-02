import type { MetadataRoute } from "next";

import { BACKEND_URL } from "@/lib/server-api";
import { siteUrl } from "@/lib/site";

// The list of public profiles comes from the database, so the sitemap is
// generated per request instead of being frozen at build time.
export const dynamic = "force-dynamic";

interface PublicUserEntry {
  id: string;
  display_name: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/public/users`, {
      cache: "no-store",
    });

    if (response.ok) {
      const { users } = (await response.json()) as { users: PublicUserEntry[] };

      for (const user of users) {
        entries.push({
          url: `${base}/u/${user.id}`,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch {
    // A sitemap without profiles is still better than a 500.
  }

  return entries;
}
