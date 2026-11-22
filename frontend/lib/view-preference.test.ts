// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { readViewPreference, saveViewPreference } from "./view-preference";

describe("view preference", () => {
  beforeEach(() => localStorage.clear());

  it("falls back when nothing is stored", () => {
    expect(readViewPreference("jey:view:test", "grid")).toBe("grid");
  });

  it("round-trips list and grid", () => {
    saveViewPreference("jey:view:test", "grid");
    expect(readViewPreference("jey:view:test")).toBe("grid");
    saveViewPreference("jey:view:test", "list");
    expect(readViewPreference("jey:view:test")).toBe("list");
  });

  it("ignores corrupt values and keeps the fallback", () => {
    localStorage.setItem("jey:view:test", "broken");
    expect(readViewPreference("jey:view:test", "list")).toBe("list");
  });
});
