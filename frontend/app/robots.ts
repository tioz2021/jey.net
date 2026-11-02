import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

// Built from runtime configuration: the same bundle serves any hostname.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal pages and the API are not for crawlers.
        disallow: ["/items", "/tags", "/dashboard", "/settings", "/dev", "/api/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
