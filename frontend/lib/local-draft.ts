export interface ItemDraft {
  review: string;
  body: string;
  savedAt: number;
}

export function draftKey(itemId: string | undefined): string {
  // The item id is stable before user context hydrates; using the user id here
  // would make the first render miss the draft and overwrite it with server data.
  return `jey:item-draft:${itemId ?? "new"}`;
}

export function readDraft(key: string): ItemDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ItemDraft>;
    if (typeof parsed.review !== "string" || typeof parsed.body !== "string") {
      return null;
    }
    return {
      review: parsed.review,
      body: parsed.body,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveDraft(key: string, review: string, body: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!review.trim() && !body.trim()) {
      window.localStorage.removeItem(key);
      return;
    }
    const draft: ItemDraft = { review, body, savedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage may be disabled in a private/embedded context.
  }
}

export function removeDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}
