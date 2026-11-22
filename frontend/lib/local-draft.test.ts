// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { draftKey, readDraft, removeDraft, saveDraft } from "./local-draft";

describe("item drafts", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a review and private note", () => {
    const key = draftKey("item-1");
    saveDraft(key, "черновик", "private");
    expect(readDraft(key)).toMatchObject({ review: "черновик", body: "private" });
  });

  it("removes an empty draft and ignores broken data", () => {
    const key = draftKey(undefined);
    saveDraft(key, "text", "");
    removeDraft(key);
    expect(readDraft(key)).toBeNull();
    localStorage.setItem(key, "{broken");
    expect(readDraft(key)).toBeNull();
  });

  it("uses item-specific keys", () => {
    saveDraft(draftKey("a"), "A", "");
    saveDraft(draftKey("b"), "B", "");
    expect(readDraft(draftKey("a"))?.review).toBe("A");
    expect(readDraft(draftKey("b"))?.review).toBe("B");
  });
});
