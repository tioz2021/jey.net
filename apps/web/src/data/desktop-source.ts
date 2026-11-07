import type { CatalogueSource } from "@/lib/data-source";
import type { Item, ItemList, Stats } from "@/lib/types";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function invoke(): Invoke {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  if (!api?.core?.invoke) throw new Error("Tauri API is unavailable");
  return api.core.invoke;
}

function isDesktop(): boolean {
  return Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
}

function localStats(items: Item[]): Stats {
  const by_kind: Record<string, number> = {};
  const by_status: Record<string, number> = {};
  let rating = 0;
  let rated = 0;
  for (const item of items) {
    by_kind[item.kind] = (by_kind[item.kind] ?? 0) + 1;
    by_status[item.status] = (by_status[item.status] ?? 0) + 1;
    if (item.rating) { rating += item.rating; rated += 1; }
  }
  return { total: items.length, by_kind, by_status, average_rating: rated ? rating / rated : 0, by_month: [], by_year: [], tags: [] } as Stats;
}

export const desktopCatalogueSource: CatalogueSource = {
  async list(filters) {
    const query = filters.q?.trim() ?? "";
    const items = query
      ? await invoke()<Item[]>("local_search_items", { query })
      : await invoke()<Item[]>("local_list_items", { query: null });
    return { items, next_cursor: null } satisfies ItemList;
  },
  async get(id) {
    const item = await invoke()<Item | null>("local_get_item", { id });
    if (!item) throw new Error("Запись не найдена");
    return item;
  },
  async stats() {
    return localStats(await invoke()<Item[]>("local_list_items", { query: null }));
  },
  create: (input) => invoke()<Item>("local_create_item", { newItem: input }),
  async update(id, patch) {
    return invoke()<Item | null>("local_update_item", { id, title: patch.title ?? null, status: patch.status ?? null, rating: patch.rating ?? null, review: patch.review ?? null });
  },
  delete: (id) => invoke()<boolean>("local_delete_item", { id }),
  coverData: (key) => invoke()<string | null>("local_cover_data", { key }),
};

export const activeCatalogueSource = isDesktop() ? desktopCatalogueSource : undefined;
