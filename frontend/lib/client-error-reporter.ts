/**
 * Sends sanitized client errors to the API. Best-effort: telemetry must never
 * break the page or generate another error report.
 */

declare const __APP_VERSION__: string;

type Detail = { scope?: unknown; error?: unknown };

let installed = false;
let sent = 0;

function text(value: unknown): string {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === "string") return value;
  return String(value ?? "unknown error");
}

function stack(value: unknown): string | null {
  return value instanceof Error && value.stack ? value.stack : null;
}

export function installClientErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const seen = new Set<string>();

  window.addEventListener("jey:client-error", (event) => {
    const detail = (event as CustomEvent<Detail>).detail ?? {};
    const scope = typeof detail.scope === "string" ? detail.scope : "unknown";
    const message = text(detail.error);
    const key = `${scope}:${message}`;
    if (seen.has(key) || sent >= 20) return;
    seen.add(key);
    sent += 1;

    const body = {
      route: window.location.pathname,
      scope,
      message,
      stack: stack(detail.error),
      app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "web",
      request_id: (detail.error as { requestId?: unknown } | null)?.requestId ?? null,
    };
    void fetch("/api/v1/client-errors", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      /* telemetry is best-effort */
    });
  });
}
