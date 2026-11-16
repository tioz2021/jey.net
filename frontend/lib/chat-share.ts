import type { Item, ItemKind } from "./types";

const PREFIX = "[[jey-item-share-v1]]";

export type SharedItem = {
  id: string;
  kind: ItemKind;
  title: string;
  year: number | null;
  rating: number | null;
  review: string | null;
  cover_key: string | null;
  url: string | null;
};

export function encodeItemShare(item: Item, handle: string | undefined, isPublic: boolean): string {
  const link =
    isPublic && item.status === "done" && !item.public_hidden && handle
      ? `/u/${encodeURIComponent(handle)}/item/${encodeURIComponent(item.slug || item.id)}`
      : null;
  const shared: SharedItem = {
    id: item.id,
    kind: item.kind,
    title: item.title,
    year: item.year,
    rating: item.rating,
    // Keep the legacy plaintext fallback under the 4000-char message limit.
    review: item.review ? item.review.slice(0, 1200) : null,
    cover_key: item.cover_key,
    url: link,
  };
  return `${PREFIX}${JSON.stringify({ text: `Поделился записью: ${item.title}`, item: shared })}`;
}

export function decodeItemShare(body: string): { text: string; item: SharedItem } | null {
  if (!body.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(PREFIX.length)) as {
      text?: string;
      item?: SharedItem;
    };
    if (!parsed.item || !parsed.item.title) return null;
    return { text: parsed.text || `Поделился записью: ${parsed.item.title}`, item: parsed.item };
  } catch {
    return null;
  }
}
