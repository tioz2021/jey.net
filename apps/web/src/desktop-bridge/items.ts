import type { Item, ItemKind, ItemStatus } from "@/lib/types";

import { statsFrom, type BridgeContext } from "./context";

export async function handleItems(ctx: BridgeContext): Promise<Response | null> {
  const { api, url, path, method, body, json, remember, remote } = ctx;

  if (path === "/api/v1/items" && method === "GET") {
    if (url.searchParams.get("only_deleted") === "true") {
      const items = await api.invoke<Item[]>("local_list_deleted_items");
      return json({ items, next_cursor: null });
    }
    const query = url.searchParams.get("q")?.trim() ?? "";
    const items = query
      ? await api.invoke<Item[]>("local_search_items", { query })
      : await api.invoke<Item[]>("local_list_items", { query: null });
    const kind = url.searchParams.get("kind") as ItemKind | null;
    const status = url.searchParams.get("status") as ItemStatus | null;
    return json({
      items: items.filter(
        (item) => (!kind || item.kind === kind) && (!status || item.status === status),
      ),
      next_cursor: null,
    });
  }

  if (path === "/api/v1/trash" && method === "DELETE") {
    const purged = await api.invoke<number>("local_empty_trash");
    return json({ purged });
  }

  const purge = path.match(/^\/api\/v1\/items\/([^/]+)\/purge$/);
  if (purge && method === "DELETE") {
    await api.invoke<boolean>("local_purge_item", { id: purge[1] });
    return new Response(null, { status: 204 });
  }

  if (path === "/api/v1/items" && method === "POST") {
    const result = { item: await api.invoke<Item>("local_create_item", { newItem: body }) };
    window.dispatchEvent(new Event("jey:sync-needed"));
    return json(result);
  }

  if (path === "/api/v1/stats") {
    return json(statsFrom(await api.invoke<Item[]>("local_list_items", { query: null })));
  }

  if (path === "/api/v1/collections" && method === "GET") {
    try {
      await api.invoke("local_sync");
    } catch {
      /* offline or busy */
    }
    try {
      return await remote(method, path);
    } catch {
      /* fall through */
    }
    return json(await api.invoke<{ collections: unknown[] }>("local_list_collections"));
  }

  if (path === "/api/v1/collections" && method === "POST") {
    const created = await api.invoke("local_create_collection", { input: body });
    try {
      await api.invoke("local_sync");
    } catch {
      /* queued */
    }
    return json(created);
  }

  const collectionItem = path.match(/^\/api\/v1\/collections\/([^/]+)$/);
  if (collectionItem) {
    const id = collectionItem[1];
    if (method === "GET") {
      try {
        return await remote(method, path);
      } catch {
        return json(await api.invoke("local_collection_detail", { id }));
      }
    }
    if (method === "PATCH") {
      try {
        return await remote(method, path, body);
      } catch {
        await api.invoke("local_update_collection", { id, input: body });
        return json({ ok: true });
      }
    }
    if (method === "DELETE") {
      try {
        return await remote(method, path);
      } catch {
        await api.invoke("local_delete_collection", { id });
        return new Response(null, { status: 204 });
      }
    }
  }

  if (path === "/api/v1/collections/for-item" || path.startsWith("/api/v1/collections/for-item/")) {
    try {
      return await remote(method, path);
    } catch {
      return json({ collections: [] });
    }
  }

  if (/^\/api\/v1\/items\/[^/]+\/neighbors$/.test(path)) {
    return json({ prev_id: null, next_id: null });
  }

  const itemAction = path.match(/^\/api\/v1\/items\/[^/]+\/(poster|refresh)$/);
  if (itemAction && method === "POST") {
    try {
      await api.invoke("local_sync");
    } catch {
      /* the item can still be retried */
    }
    try {
      const response = await remote(method, path, body);
      try {
        await api.invoke("local_sync");
      } catch {
        /* media may lag */
      }
      window.dispatchEvent(new Event("jey:item-refreshed"));
      return response;
    } catch {
      /* fall through */
    }
  }

  const itemPath = path.match(/^\/api\/v1\/items\/([^/]+)$/);
  if (itemPath) {
    const id = itemPath[1];
    if (method === "GET") {
      const item = await api.invoke<Item | null>("local_get_item", { id });
      return item ? json({ item }) : json({ error: { code: "not_found" } }, 404);
    }
    if (method === "PATCH") {
      const item = await api.invoke<Item | null>("local_update_item", {
        id,
        title: body?.title ?? null,
        status: body?.status ?? null,
        rating: body?.rating ?? null,
        review: body?.review ?? null,
      });
      return item ? json({ item }) : json({ error: { code: "not_found" } }, 404);
    }
    if (method === "DELETE") {
      await api.invoke<boolean>("local_delete_item", { id });
      window.dispatchEvent(new Event("jey:sync-needed"));
      return new Response(null, { status: 204 });
    }
  }

  return null;
}
