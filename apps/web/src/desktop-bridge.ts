import type { Item, ItemKind, ItemStatus, Stats } from "@/lib/types";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function tauri(): { invoke: Invoke } | null {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return api?.core?.invoke ? { invoke: api.core.invoke } : null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function statsFrom(items: Item[]): Stats {
  const by_kind: Record<string, number> = {};
  const by_status: Record<string, number> = {};
  let rating = 0, rated = 0;
  for (const item of items) {
    by_kind[item.kind] = (by_kind[item.kind] ?? 0) + 1;
    by_status[item.status] = (by_status[item.status] ?? 0) + 1;
    if (item.rating) { rating += item.rating; rated += 1; }
  }
  return { total: items.length, by_kind, by_status, average_rating: rated ? rating / rated : 0, by_month: [], by_year: [], tags: [] } as Stats;
}

/** Offline bridge for the catalogue subset. Unknown API calls are rejected. */
export function installDesktopBridge() {
  const api = tauri();
  if (!api) return;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!raw.includes("/api/v1/")) return new Response(null, { status: 503 });
    const url = new URL(raw, window.location.origin);
    const path = url.pathname;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

    if (path === "/api/v1/me") {
      const access = await api.invoke<{ has_access: boolean; user_id?: string }>("local_access_status");
      if (!access.has_access || !access.user_id) return json({ error: { code: "unauthorized" } }, 401);
      if (method === "GET") return json({ user: await api.invoke("local_profile") });
      if (method === "PATCH") return json({ user: await api.invoke("local_update_profile", { input: body }) });
    }
    if (path === "/api/v1/items" && method === "GET") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      const items = query ? await api.invoke<Item[]>("local_search_items", { query }) : await api.invoke<Item[]>("local_list_items", { query: null });
      const kind = url.searchParams.get("kind") as ItemKind | null;
      const status = url.searchParams.get("status") as ItemStatus | null;
      return json({ items: items.filter((item) => (!kind || item.kind === kind) && (!status || item.status === status)), next_cursor: null });
    }
    if (path === "/api/v1/items" && method === "POST") {
      return json({ item: await api.invoke<Item>("local_create_item", { newItem: body }) });
    }
    if (path === "/api/v1/stats") return json(statsFrom(await api.invoke<Item[]>("local_list_items", { query: null })));

    if (path === "/api/v1/collections" && method === "GET") return json(await api.invoke("local_list_collections"));
    if (path === "/api/v1/collections" && method === "POST") return json(await api.invoke("local_create_collection", { input: body }));
    const collectionItem = path.match(/^\/api\/v1\/collections\/([^/]+)$/);
    if (collectionItem) {
      const id = collectionItem[1];
      if (method === "GET") return json(await api.invoke("local_collection_detail", { id }));
      if (method === "PATCH") { await api.invoke("local_update_collection", { id, input: body }); return json({ ok: true }); }
      if (method === "DELETE") { await api.invoke("local_delete_collection", { id }); return new Response(null, { status: 204 }); }
    }
    if (path === "/api/v1/collections/for-item" || path.startsWith("/api/v1/collections/for-item/")) return json({ collections: [] });

    const commentsPath = path.match(/^\/api\/v1\/public\/users\/[^/]+\/items\/([^/]+)\/comments$/);
    if (commentsPath) {
      const itemId = commentsPath[1];
      if (method === "GET") {
        const offset = Number(url.searchParams.get("offset") ?? "0");
        return json(await api.invoke("local_list_comments", { input: { itemId, offset, limit: 5 } }));
      }
      if (method === "POST") {
        return json(await api.invoke("local_create_comment", { input: { itemId, body: body?.body, parentId: body?.parent_id ?? null } }));
      }
    }
    const commentDelete = path.match(/^\/api\/v1\/comments\/([^/]+)$/);
    if (commentDelete && method === "DELETE") return json(await api.invoke("local_delete_comment", { id: commentDelete[1] }));
    if (/^\/api\/v1\/comments\/[^/]+\/reaction$/.test(path)) return json({ reacted: false, count: 0 });
    if (/^\/api\/v1\/items\/[^/]+\/neighbors$/.test(path)) return json({ prev_id: null, next_id: null });
    const itemPath = path.match(/^\/api\/v1\/items\/([^/]+)$/);
    if (itemPath) {
      const id = itemPath[1];
      if (method === "GET") {
        const item = await api.invoke<Item | null>("local_get_item", { id });
        return item ? json({ item }) : json({ error: { code: "not_found" } }, 404);
      }
      if (method === "PATCH") {
        const item = await api.invoke<Item | null>("local_update_item", { id, title: body?.title ?? null, status: body?.status ?? null, rating: body?.rating ?? null, review: body?.review ?? null });
        return item ? json({ item }) : json({ error: { code: "not_found" } }, 404);
      }
      if (method === "DELETE") {
        await api.invoke<boolean>("local_delete_item", { id });
        return new Response(null, { status: 204 });
      }
    }
    return json({ error: { code: "offline_unsupported", message: "Раздел пока недоступен офлайн" } }, 503);
  };
}
