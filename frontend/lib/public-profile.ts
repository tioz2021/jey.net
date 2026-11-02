import { cache } from "react";

import { BACKEND_URL } from "./server-api";
import type { PublicProfileResponse } from "./types";

/**
 * Loads a public profile once per request.
 *
 * `generateMetadata` and the page itself both need the data; React's cache
 * keeps it to a single backend call.
 */
export const getPublicProfile = cache(
  async (id: string): Promise<PublicProfileResponse | null> => {
    const response = await fetch(
      `${BACKEND_URL}/api/v1/public/users/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PublicProfileResponse;
  },
);
