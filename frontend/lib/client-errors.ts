import { ApiError } from "./errors";

/**
 * Unexpected client-side failures must leave a trace. Best-effort UI work can
 * still continue, but silence makes field reports impossible to diagnose.
 */
export function reportClientError(scope: string, error: unknown): void {
  if (typeof window === "undefined") return;
  console.warn(`[jey:${scope}]`, error);
  window.dispatchEvent(
    new CustomEvent("jey:client-error", { detail: { scope, error } }),
  );
}

/** 401/403 during session hydration are expected, not reportable failures. */
export function isExpectedAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
