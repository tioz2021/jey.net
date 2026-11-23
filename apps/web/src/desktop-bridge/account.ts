import type { Item } from "@/lib/types";

import type { BridgeContext } from "./context";

export async function handleAccount(ctx: BridgeContext): Promise<Response | null> {
  const { api, path, method, body, json, remote } = ctx;

  if (path === "/api/v1/me") {
    const access = await api.invoke<{ has_access: boolean; user_id?: string }>("local_access_status");
    if (!access.has_access || !access.user_id) {
      return json({ error: { code: "unauthorized" } }, 401);
    }
    if (method === "GET") {
      try {
        const response = await remote("GET", "/api/v1/me");
        if (response.ok) return response;
      } catch {
        /* offline */
      }
      try {
        return json({ user: await api.invoke("local_refresh_profile") });
      } catch {
        return json({ user: await api.invoke("local_profile") });
      }
    }
    if (method === "PATCH") {
      try {
        return await remote("PATCH", "/api/v1/me", body);
      } catch {
        return json({ user: await api.invoke("local_update_profile", { input: body }) });
      }
    }
  }

  if (path === "/api/v1/auth/logout" || path === "/api/v1/me/sessions/revoke-all") {
    try {
      await remote("POST", path);
    } catch {
      /* offline: still clear local */
    }
    await api.invoke("local_sign_out");
    return new Response(null, { status: 204 });
  }

  if (path === "/api/v1/me/profile" || /^\/api\/v1\/public\/users\/[^/]+$/.test(path)) {
    try {
      return await remote(method, path);
    } catch {
      /* offline fallback below */
    }
    const profile = await api.invoke<Record<string, unknown>>("local_profile");
    const items = await api.invoke<Item[]>("local_list_items", { query: null });
    return json({
      profile: {
        ...profile,
        created_at: profile.created_at ?? "1970-01-01T00:00:00Z",
        followers: 0,
        following: 0,
      },
      items: items.map((item) => ({
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
      })),
      collections: [],
      preview: false,
    });
  }

  return null;
}
