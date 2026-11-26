import { beforeEach, describe, expect, it, vi } from "vitest";

import { feedSeenCutoff, markFeedSeen } from "./feed-seen";

const storage = new Map<string, string>();
const dispatchEvent = vi.fn();

beforeEach(() => {
  storage.clear();
  dispatchEvent.mockClear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", { dispatchEvent });
});

describe("feed seen cutoff", () => {
  it("uses the server timestamp instead of the client clock", () => {
    const serverTimestamp = Date.parse("2026-11-26T00:29:07.900Z");
    markFeedSeen(serverTimestamp);
    expect(feedSeenCutoff()).toBe(serverTimestamp);
    expect(storage.get("jey.feed-seen")).toBe("2026-11-26T00:29:07.900Z");
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it("returns zero for a missing or invalid value", () => {
    expect(feedSeenCutoff()).toBe(0);
    storage.set("jey.feed-seen", "not-a-date");
    expect(feedSeenCutoff()).toBe(0);
  });
});
