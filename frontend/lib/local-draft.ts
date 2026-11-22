export interface ItemFormDraft {
  values: Record<string, unknown>;
  advanced: boolean;
  coverUploadId: string | null;
  coverCleared: boolean;
  savedAt: number;
}

export function draftKey(itemId: string | undefined): string {
  // The item id is stable before user context hydrates; using the user id here
  // would make the first render miss the draft and overwrite it with server data.
  return `jey:item-draft:${itemId ?? "new"}`;
}

export function readDraft(key: string): ItemFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ItemFormDraft>;
    if (!parsed.values || typeof parsed.values !== "object") return null;
    return {
      values: parsed.values,
      advanced: Boolean(parsed.advanced),
      coverUploadId: typeof parsed.coverUploadId === "string" ? parsed.coverUploadId : null,
      coverCleared: Boolean(parsed.coverCleared),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveDraft(
  key: string,
  draft: Omit<ItemFormDraft, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const empty =
      !String(draft.values.title ?? "").trim() &&
      !String(draft.values.review ?? "").trim() &&
      !String(draft.values.body ?? "").trim() &&
      !String(draft.values.external_id ?? "").trim();
    if (empty && !draft.coverUploadId) {
      window.localStorage.removeItem(key);
      return;
    }
    const value: ItemFormDraft = { ...draft, savedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(value));
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
