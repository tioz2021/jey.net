import type { Item, ItemPatch, NewItem } from "@/lib/types";

import type { ItemSource } from "./source";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function invoke(): Invoke {
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  if (!tauri?.core?.invoke) {
    throw new Error("Tauri API is unavailable");
  }
  return tauri.core.invoke;
}

export const tauriSource: ItemSource = {
  list: (query) => invoke()<Item[]>("local_list_items", { query: query ?? null }),
  search: (query) => invoke()<Item[]>("local_search_items", { query }),
  get: (id) => invoke()<Item | null>("local_get_item", { id }),
  create: (input: NewItem) => invoke()<Item>("local_create_item", { newItem: input }),
  update: (id: string, patch: ItemPatch) =>
    invoke()<Item | null>("local_update_item", {
      id,
      title: patch.title ?? null,
      status: patch.status ?? null,
      rating: patch.rating ?? null,
      review: patch.review ?? null,
    }),
  delete: (id: string) => invoke()<boolean>("local_delete_item", { id }),
};
