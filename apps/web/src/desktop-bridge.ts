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
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!raw.includes("/api/v1/")) return originalFetch(input, init);
    const url = new URL(raw, window.location.origin);
    const path = url.pathname;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const remote = async (remoteMethod: string, remotePath: string, remoteBody?: unknown) => {
      const result = await api.invoke<{ status: number; body: unknown }>("local_proxy", {
        method: remoteMethod,
        path: `${remotePath}${url.search}`,
        body: remoteBody,
      });
      if (result.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json" } });
    };

    if (path === "/api/v1/me") {
      const access = await api.invoke<{ has_access: boolean; user_id?: string }>("local_access_status");
      if (!access.has_access || !access.user_id) return json({ error: { code: "unauthorized" } }, 401);
      if (method === "GET") {
        try { return json({ user: await api.invoke("local_refresh_profile") }); }
        catch { return json({ user: await api.invoke("local_profile") }); }
      }
      if (method === "PATCH") return json({ user: await api.invoke("local_update_profile", { input: body }) });
    }
    if (path === "/api/v1/auth/logout" || path === "/api/v1/auth/logout-all") {
      await api.invoke("local_sign_out");
      return new Response(null, { status: 204 });
    }

    if (path === "/api/v1/me/profile" || /^\/api\/v1\/public\/users\/[^/]+$/.test(path)) {
      try { return await remote(method, path); } catch { /* offline fallback below */ }
      const profile = await api.invoke<Record<string, unknown>>("local_profile");
      const items = await api.invoke<Item[]>("local_list_items", { query: null });
      return json({
        profile: { ...profile, created_at: profile.created_at ?? "1970-01-01T00:00:00Z", followers: 0, following: 0 },
        items: items.map((item) => ({
          id: item.id, slug: item.slug ?? item.id, kind: item.kind, title: item.title,
          subtitle: item.subtitle, year: item.year, status: item.status, rating: item.rating,
          review: item.review, cover_key: item.cover_key, external_source: item.external_source,
          external_id: item.external_id, details: item.details ?? null,
          public_hidden: Boolean(item.public_hidden), updated_at: item.updated_at,
        })),
        collections: [],
        preview: false,
      });
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

    if (path === "/api/v1/collections" && method === "GET") {
      const local = await api.invoke<{ collections: unknown[] }>("local_list_collections");
      if (local.collections?.length) return json(local);
      try { return await remote(method, path); } catch { return json(local); }
    }
    if (path === "/api/v1/collections" && method === "POST") return json(await api.invoke("local_create_collection", { input: body }));
    const collectionItem = path.match(/^\/api\/v1\/collections\/([^/]+)$/);
    if (collectionItem) {
      const id = collectionItem[1];
      if (method === "GET") return json(await api.invoke("local_collection_detail", { id }));
      if (method === "PATCH") { await api.invoke("local_update_collection", { id, input: body }); return json({ ok: true }); }
      if (method === "DELETE") { await api.invoke("local_delete_collection", { id }); return new Response(null, { status: 204 }); }
    }
    if (path === "/api/v1/collections/for-item" || path.startsWith("/api/v1/collections/for-item/")) return json({ collections: [] });

    const publicItemPath = path.match(/^\/api\/v1\/public\/users\/[^/]+\/items\/([^/]+)$/);
    if (publicItemPath) {
      try { return await remote(method, path); } catch { /* offline fallback below */ }
      const items = await api.invoke<Item[]>("local_list_items", { query: null });
      const item = items.find((entry) => entry.id === publicItemPath[1] || entry.slug === publicItemPath[1]);
      if (!item) return json({ error: { code: "not_found" } }, 404);
      return json({
        item: {
          id: item.id, slug: item.slug ?? item.id, kind: item.kind, title: item.title,
          subtitle: item.subtitle, year: item.year, status: item.status, rating: item.rating,
          review: item.review, cover_key: item.cover_key, external_source: item.external_source,
          external_id: item.external_id, details: item.details ?? null,
          public_hidden: Boolean(item.public_hidden), updated_at: item.updated_at,
        },
        progress_visible: false,
      });
    }

    const commentsPath = path.match(/^\/api\/v1\/public\/users\/[^/]+\/items\/([^/]+)\/comments$/);
    if (commentsPath) {
      const itemId = commentsPath[1];
      if (method === "GET") {
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const local = await api.invoke<{ total: number }>("local_list_comments", { input: { itemId, offset, limit: 5 } });
        if (local.total > 0) return json(local);
        try { return await remote(method, path); } catch { return json(local); }
      }
      if (method === "POST") {
        try { return await remote(method, path, body); } catch { return json(await api.invoke("local_create_comment", { input: { itemId, body: body?.body, parentId: body?.parent_id ?? null } })); }
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
    try { return await remote(method, path, body); }
    catch { return json({ error: { code: "offline_unsupported", message: "Раздел пока недоступен офлайн" } }, 503); }
  };
}
