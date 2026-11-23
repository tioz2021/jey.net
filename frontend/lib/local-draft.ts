import { reportClientError } from "./client-errors";

export interface ItemFormDraft {
  values: Record<string, unknown>;
  advanced: boolean;
  coverUploadId: string | null;
  coverPreview: string | null;
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
      coverPreview: typeof parsed.coverPreview === "string" ? parsed.coverPreview : null,
      coverCleared: Boolean(parsed.coverCleared),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch (error) {
    reportClientError("draft.read", error);
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
    if (empty && !draft.coverUploadId && !draft.coverPreview) {
      window.localStorage.removeItem(key);
      return;
    }
    const value: ItemFormDraft = { ...draft, savedAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage may be disabled in a private/embedded context, but the failure
    // must still be visible: losing a draft is user-visible data loss.
    reportClientError("draft.save", error);
  }
}

export function removeDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    reportClientError("draft.remove", error);
  }
}
