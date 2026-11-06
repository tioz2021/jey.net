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
  create: (input: NewItem) => invoke()<Item>("local_create_item", { newItem: input }),
  update: (id: string, patch: ItemPatch) =>
    invoke()<Item | null>("local_update_item", { id, title: patch.title ?? "" }),
  delete: (id: string) => invoke()<boolean>("local_delete_item", { id }),
};
