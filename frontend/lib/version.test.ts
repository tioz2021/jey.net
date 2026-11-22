import { describe, expect, it } from "vitest";

import { isNewerVersion } from "./version";

describe("version comparison", () => {
  it("compares numeric parts", () => {
    expect(isNewerVersion("0.8.0", "0.7.9")).toBe(true);
    expect(isNewerVersion("0.7.10", "0.7.9")).toBe(true);
    expect(isNewerVersion("v1.0.0", "0.99.0")).toBe(true);
    expect(isNewerVersion("0.7.0", "0.7.0")).toBe(false);
    expect(isNewerVersion("0.6.9", "0.7.0")).toBe(false);
  });
});
