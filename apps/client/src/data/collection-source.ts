import type { CollectionSource } from "@/lib/collection-source";
import type { Collection } from "@/lib/types";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function invoke(): Invoke {
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  if (!tauri?.core?.invoke) throw new Error("Tauri API is unavailable");
  return tauri.core.invoke;
}

export const localCollectionSource: CollectionSource = {
  list: () =>
    invoke()<{ collections: Collection[] }>("local_list_collections").then(
      (response) => response.collections,
    ),
  create: (input) => invoke()<Collection>("local_create_collection", { input }),
  update: (id, input) => invoke()<void>("local_update_collection", { id, input }),
  remove: (id) => invoke()<void>("local_delete_collection", { id }),
};
