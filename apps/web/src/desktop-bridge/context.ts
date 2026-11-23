import type { Item, Stats } from "@/lib/types";

export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface BridgeContext {
  api: { invoke: Invoke };
  url: URL;
  path: string;
  method: string;
  body: Record<string, any> | undefined;
  json: (data: unknown, status?: number) => Response;
  remember: (key: string, response: Response) => Promise<Response>;
  cached: (key: string) => Promise<Response | null>;
  cacheValue: (key: string) => Promise<Record<string, any> | null>;
  putCache: (key: string, value: unknown) => Promise<void>;
  cachedItem: (itemId: string) => Promise<any | null>;
  enqueueSocial: (method: string, path: string, body?: unknown) => Promise<void>;
  remote: (method: string, path: string, body?: unknown) => Promise<Response>;
  fallback: () => Promise<Response>;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function statsFrom(items: Item[]): Stats {
  const by_kind: Record<string, number> = {};
  const by_status: Record<string, number> = {};
  let rating = 0;
  let rated = 0;
  for (const item of items) {
    by_kind[item.kind] = (by_kind[item.kind] ?? 0) + 1;
    by_status[item.status] = (by_status[item.status] ?? 0) + 1;
    if (item.rating) {
      rating += item.rating;
      rated += 1;
    }
  }
  return {
    total: items.length,
    by_kind,
    by_status,
    average_rating: rated ? rating / rated : 0,
    by_month: [],
    by_year: [],
    tags: [],
  } as Stats;
}

export function createBridgeContext(
  api: { invoke: Invoke },
  url: URL,
  method: string,
  body: Record<string, any> | undefined,
): BridgeContext {
  const path = url.pathname;
  const remember = async (key: string, response: Response) => {
    try {
      const data = await response.clone().json();
      await api.invoke("local_cache_put", { key, payload: data });
    } catch {
      /* cache is best-effort */
    }
    return response;
  };
  const cached = async (key: string): Promise<Response | null> => {
    try {
      const value = await api.invoke<unknown | null>("local_cache_get", { key });
      return value == null ? null : json(value);
    } catch {
      return null;
    }
  };
  const cacheValue = async (key: string): Promise<Record<string, any> | null> => {
    try {
      return await api.invoke<Record<string, any> | null>("local_cache_get", { key });
    } catch {
      return null;
    }
  };
  const putCache = async (key: string, value: unknown) => {
    try {
      await api.invoke("local_cache_put", { key, payload: value });
    } catch {
      /* best effort */
    }
  };
  const cachedItem = async (itemId: string): Promise<any | null> => {
    for (const key of [
      "/api/v1/liked",
      "/api/v1/feed?sort=new&period=all&offset=0&limit=20",
      "/api/v1/recommendations/friends?sort=rating&period=all&offset=0&limit=12",
      "/api/v1/recommendations/community?sort=rating&period=all&offset=0&limit=12",
    ]) {
      const value = await cacheValue(key);
      const found = value?.items?.find((entry: any) => entry.id === itemId);
      if (found) return found;
    }
    return null;
  };
  const enqueueSocial = async (requestMethod: string, requestPath: string, requestBody?: unknown) => {
    try {
      await api.invoke("local_enqueue_social", {
        method: requestMethod,
        path: requestPath,
        body: requestBody,
      });
    } catch {
      /* the UI remains optimistic until the next sync */
    }
    window.dispatchEvent(new Event("jey:sync-needed"));
  };
  const remote = async (remoteMethod: string, remotePath: string, remoteBody?: unknown) => {
    const result = await api.invoke<{ status: number; body: unknown }>("local_proxy", {
      method: remoteMethod,
      path: `${remotePath}${url.search}`,
      body: remoteBody,
    });
    if (result.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  const fallback = async () => {
    try {
      return await remote(method, path, body);
    } catch {
      return json(
        { error: { code: "offline_unsupported", message: "Раздел пока недоступен офлайн" } },
        503,
      );
    }
  };

  return {
    api,
    url,
    path,
    method,
    body,
    json,
    remember,
    cached,
    cacheValue,
    putCache,
    cachedItem,
    enqueueSocial,
    remote,
    fallback,
  };
}
