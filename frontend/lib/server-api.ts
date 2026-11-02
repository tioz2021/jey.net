import { cookies } from "next/headers";

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

/**
 * Calls the API from a server component, forwarding the session cookie.
 *
 * Used by pages that should arrive with their content already rendered
 * (details, settings) instead of showing a client-side skeleton.
 */
export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies();

  return fetch(`${BACKEND_URL}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: cookieStore.toString(),
    },
    cache: "no-store",
  });
}
