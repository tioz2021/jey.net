// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors";
import { isExpectedAuthError, reportClientError } from "./client-errors";

describe("client error reporting", () => {
  it("reports unexpected errors without breaking the caller", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const listener = vi.fn();
    window.addEventListener("jey:client-error", listener);

    const error = new Error("boom");
    reportClientError("test.scope", error);

    expect(warn).toHaveBeenCalledWith("[jey:test.scope]", error);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail).toEqual({ scope: "test.scope", error });

    window.removeEventListener("jey:client-error", listener);
    warn.mockRestore();
  });

  it("treats only 401/403 API failures as expected auth states", () => {
    expect(isExpectedAuthError(new ApiError(401, "unauthorized", "no", null, null))).toBe(true);
    expect(isExpectedAuthError(new ApiError(403, "forbidden", "no", null, null))).toBe(true);
    expect(isExpectedAuthError(new ApiError(500, "internal", "no", null, null))).toBe(false);
    expect(isExpectedAuthError(new Error("network"))).toBe(false);
  });
});
