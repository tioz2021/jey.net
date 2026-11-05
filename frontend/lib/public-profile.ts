import { cache } from "react";

import { BACKEND_URL, backendFetch } from "./server-api";
import type { Item, PublicItem, PublicProfileResponse } from "./types";

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

    if (response.ok) {
      return (await response.json()) as PublicProfileResponse;
    }

    // A private profile is still a valid preview for its owner.
    const me = await backendFetch("/me");
    if (!me.ok) return null;
    const { user } = (await me.json()) as { user: { id: string } };
    if (user.id !== id) return null;
    const preview = await backendFetch("/me/profile");
    if (!preview.ok) return null;
    return (await preview.json()) as PublicProfileResponse;
  },
);

/** One finished record of a public profile. */
export const getPublicItem = cache(
  async (userId: string, itemId: string): Promise<PublicItem | null> => {
    const response = await fetch(
      `${BACKEND_URL}/api/v1/public/users/${encodeURIComponent(userId)}/items/${encodeURIComponent(itemId)}`,
      { cache: "no-store" },
    );

    if (response.ok) {
      const body = (await response.json()) as {
        item: PublicItem;
        progress_visible?: boolean;
      };
      return { ...body.item, progress_visible: body.progress_visible };
    }

    // The owner can still open their record while previewing a private profile.
    const me = await backendFetch("/me");
    if (!me.ok) return null;
    const { user } = (await me.json()) as { user: { id: string } };
    if (user.id !== userId) return null;
    const own = await backendFetch(`/items/${encodeURIComponent(itemId)}`);
    if (!own.ok) return null;
    const { item } = (await own.json()) as { item: Item };
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      year: item.year,
      status: item.status,
      rating: item.rating,
      review: item.review,
      cover_key: item.cover_key,
      external_source: item.external_source,
      external_id: item.external_id,
      details: item.details,
      public_hidden: item.public_hidden,
      updated_at: item.updated_at,
      progress_visible: true,
    };
  },
);
