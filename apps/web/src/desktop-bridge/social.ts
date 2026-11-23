import type { Item } from "@/lib/types";

import type { BridgeContext } from "./context";

export async function handleSocial(ctx: BridgeContext): Promise<Response | null> {
  const {
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
  } = ctx;

  const likedPath = path === "/api/v1/liked";
  if (likedPath && method === "GET") {
    try {
      return await remember("/api/v1/liked", await remote(method, path));
    } catch {
      const cachedResponse = await cached("/api/v1/liked");
      return cachedResponse ?? json({ error: { code: "offline_unsupported" } }, 503);
    }
  }

  const tierListPath = path === "/api/v1/tier-lists";
  const tierDetail = path.match(/^\/api\/v1\/tier-lists\/([^/]+)$/);
  const tierItem = path.match(/^\/api\/v1\/tier-lists\/([^/]+)\/items\/([^/]+)$/);
  if (tierListPath && method === "GET") {
    try {
      return await remember("/api/v1/tier-lists", await remote(method, path));
    } catch {
      const cachedResponse = await cached("/api/v1/tier-lists");
      return cachedResponse ?? json({ error: { code: "offline_unsupported" } }, 503);
    }
  }
  if (tierDetail && method === "GET") {
    try {
      return await remember(path, await remote(method, path));
    } catch {
      const cachedResponse = await cached(path);
      return cachedResponse ?? json({ error: { code: "offline_unsupported" } }, 503);
    }
  }
  if (tierListPath && method === "POST") {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const created = {
      id,
      title: body?.title ?? "",
      slug: `local-${id.slice(0, 8)}`,
      visibility: body?.visibility ?? "private",
      kind: body?.kind ?? "all",
      auto: false,
      created_at: now,
      updated_at: now,
      item_count: 0,
    };
    const list = (await cacheValue("/api/v1/tier-lists")) ?? { tier_lists: [] };
    list.tier_lists = [created, ...(Array.isArray(list.tier_lists) ? list.tier_lists : [])];
    await putCache("/api/v1/tier-lists", list);
    await putCache(`/api/v1/tier-lists/${id}`, { tier_list: created, items: [] });
    await enqueueSocial("POST", "/api/v1/tier-lists", { ...body, id });
    return json(created, 201);
  }
  if (tierDetail && method === "PATCH") {
    try {
      return await remember(path, await remote(method, path, body));
    } catch {
      const detail = (await cacheValue(path)) ?? { tier_list: {}, items: [] };
      detail.tier_list = {
        ...detail.tier_list,
        ...body,
        updated_at: new Date().toISOString(),
      };
      await putCache(path, detail);
      const list = await cacheValue("/api/v1/tier-lists");
      if (list?.tier_lists) {
        list.tier_lists = list.tier_lists.map((entry: any) =>
          entry.id === tierDetail[1] ? { ...entry, ...body } : entry,
        );
        await putCache("/api/v1/tier-lists", list);
      }
      await enqueueSocial("PATCH", path, body);
      return json({ ok: true });
    }
  }
  if (tierDetail && method === "DELETE") {
    try {
      return await remote(method, path);
    } catch {
      const list = await cacheValue("/api/v1/tier-lists");
      if (list?.tier_lists) {
        list.tier_lists = list.tier_lists.filter((entry: any) => entry.id !== tierDetail[1]);
        await putCache("/api/v1/tier-lists", list);
      }
      await enqueueSocial("DELETE", path);
      return new Response(null, { status: 204 });
    }
  }
  if (tierItem && (method === "PUT" || method === "DELETE")) {
    try {
      return await remote(method, path, body);
    } catch {
      const detailKey = `/api/v1/tier-lists/${tierItem[1]}`;
      const detail = await cacheValue(detailKey);
      if (detail && Array.isArray(detail.items)) {
        if (method === "PUT") {
          detail.items = detail.items.map((item: any) =>
            item.id === tierItem[2]
              ? {
                  ...item,
                  tier: body?.tier ?? item.tier,
                  position: body?.position ?? item.position,
                }
              : item,
          );
        } else {
          detail.items = detail.items.filter((item: any) => item.id !== tierItem[2]);
        }
        await putCache(detailKey, detail);
      }
      await enqueueSocial(method, path, body);
      return method === "PUT"
        ? json({ ok: true, tier: body?.tier ?? "S" })
        : new Response(null, { status: 204 });
    }
  }

  const reactionPath = path.match(/^\/api\/v1\/public\/items\/([^/]+)\/reactions$/);
  if (reactionPath && method === "POST") {
    try {
      return await remote(method, path, body);
    } catch {
      const itemId = reactionPath[1];
      const liked = (await cacheValue("/api/v1/liked")) ?? { items: [] };
      if (!Array.isArray(liked.items)) liked.items = [];
      const alreadyLiked = liked.items.some((entry: any) => entry.id === itemId);
      if (alreadyLiked) {
        liked.items = liked.items.filter((entry: any) => entry.id !== itemId);
        await putCache("/api/v1/liked", liked);
        await enqueueSocial("PUT", `/api/v1/public/items/${itemId}/reactions`, { liked: false });
        return json({ reacted: false, count: 0 });
      }
      const source = await cachedItem(itemId);
      if (!source) return json({ error: { code: "offline_unsupported" } }, 503);
      liked.items = [
        {
          ...source,
          author_name: source.author_name ?? source.people?.[0]?.name ?? source.author_handle,
          liked_at: new Date().toISOString(),
        },
        ...liked.items,
      ];
      await putCache("/api/v1/liked", liked);
      await enqueueSocial("PUT", `/api/v1/public/items/${itemId}/reactions`, { liked: true });
      return json({ reacted: true, count: 0 });
    }
  }

  if (/^\/api\/v1\/public\/users\/[^/]+\/tier-lists\/[^/]+$/.test(path) && method === "GET") {
    try {
      return await remember(path, await remote(method, path));
    } catch {
      const cachedResponse = await cached(path);
      return cachedResponse ?? json({ error: { code: "offline_unsupported" } }, 503);
    }
  }

  const publicItemPath = path.match(/^\/api\/v1\/public\/users\/[^/]+\/items\/([^/]+)$/);
  if (publicItemPath) {
    try {
      return await remote(method, path);
    } catch {
      /* offline fallback below */
    }
    const items = await api.invoke<Item[]>("local_list_items", { query: null });
    const item = items.find(
      (entry) => entry.id === publicItemPath[1] || entry.slug === publicItemPath[1],
    );
    if (!item) return json({ error: { code: "not_found" } }, 404);
    return json({
      item: {
        id: item.id,
        slug: item.slug ?? item.id,
        kind: item.kind,
        title: item.title,
        subtitle: item.subtitle,
        year: item.year,
        status: item.status,
        rating: item.rating,
        review: item.review,
        cover_key: item.cover_key,
        external_source: item.external_source,
        external_id: item.external_id,
        details: item.details ?? null,
        public_hidden: Boolean(item.public_hidden),
        updated_at: item.updated_at,
      },
      progress_visible: false,
    });
  }

  const commentsPath = path.match(/^\/api\/v1\/public\/users\/[^/]+\/items\/([^/]+)\/comments$/);
  if (commentsPath) {
    const itemId = commentsPath[1];
    if (method === "GET") {
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const local = await api.invoke<{ total: number }>("local_list_comments", {
        input: { itemId, offset, limit: 5 },
      });
      if (local.total > 0) return json(local);
      try {
        return await remote(method, path);
      } catch {
        return json(local);
      }
    }
    if (method === "POST") {
      try {
        return await remote(method, path, body);
      } catch {
        return json(
          await api.invoke("local_create_comment", {
            input: {
              itemId,
              body: body?.body,
              parentId: body?.parent_id ?? null,
            },
          }),
        );
      }
    }
  }

  const commentDelete = path.match(/^\/api\/v1\/comments\/([^/]+)$/);
  if (commentDelete && method === "DELETE") {
    return json(await api.invoke("local_delete_comment", { id: commentDelete[1] }));
  }
  const reaction = path.match(/^\/api\/v1\/comments\/([^/]+)\/reaction$/);
  if (reaction && method === "POST") {
    return json(await api.invoke("local_react_comment", { id: reaction[1] }));
  }

  return null;
}
