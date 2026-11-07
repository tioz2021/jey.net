import type { Item, ItemPatch, NewItem } from "@/lib/types";

import type { ItemSource } from "./source";

const BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Shared web source; the Next page will mount this in T125.2. */
export const httpSource: ItemSource = {
  async list(query) {
    const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
    const response = await request<{ items: Item[] }>(`/items${suffix}`);
    return response.items;
  },
  async search(query) {
    const response = await request<{ items: Item[] }>(
      `/items?q=${encodeURIComponent(query)}`,
    );
    return response.items;
  },
  get: (id: string) =>
    request<{ item: Item }>(`/items/${encodeURIComponent(id)}`).then(
      (response) => response.item,
    ),
  create: (input: NewItem) =>
    request<{ item: Item }>("/items", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((response) => response.item),
  update: (id: string, patch: ItemPatch) =>
    request<{ item: Item }>(`/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((response) => response.item),
  delete: (id: string) =>
    request<void>(`/items/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
      () => true,
    ),
};
