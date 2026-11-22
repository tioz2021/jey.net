// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { draftKey, readDraft, removeDraft, saveDraft } from "./local-draft";

describe("item drafts", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a whole unsaved form", () => {
    const key = draftKey("item-1");
    saveDraft(key, {
      values: { title: "Фильм", review: "черновик", rating: "9" },
      advanced: true,
      coverUploadId: null,
      coverCleared: false,
    });
    expect(readDraft(key)).toMatchObject({
      values: { title: "Фильм", review: "черновик", rating: "9" },
      advanced: true,
    });
  });

  it("removes an empty draft and ignores broken data", () => {
    const key = draftKey(undefined);
    saveDraft(key, { values: { title: "x" }, advanced: false, coverUploadId: null, coverCleared: false });
    removeDraft(key);
    expect(readDraft(key)).toBeNull();
    localStorage.setItem(key, "{broken");
    expect(readDraft(key)).toBeNull();
  });

  it("uses item-specific keys", () => {
    saveDraft(draftKey("a"), { values: { title: "A" }, advanced: false, coverUploadId: null, coverCleared: false });
    saveDraft(draftKey("b"), { values: { title: "B" }, advanced: false, coverUploadId: null, coverCleared: false });
    expect(readDraft(draftKey("a"))?.values.title).toBe("A");
    expect(readDraft(draftKey("b"))?.values.title).toBe("B");
  });
});
