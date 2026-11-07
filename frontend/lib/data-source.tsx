"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { api } from "@/lib/api";
import type { Item, ItemFilters, ItemList, ItemPatch, NewItem, Stats } from "@/lib/types";

/** The only catalogue boundary shared by web and desktop. */
export interface CatalogueSource {
  list(filters: ItemFilters): Promise<ItemList>;
  get(id: string): Promise<Item>;
  stats(): Promise<Stats>;
  create(input: NewItem): Promise<Item>;
  update(id: string, patch: ItemPatch): Promise<Item | null>;
  delete(id: string): Promise<boolean>;
  coverData?(key: string): Promise<string | null>;
}

export const webCatalogueSource: CatalogueSource = {
  list: (filters) => api.items.list(filters),
  get: (id) => api.items.get(id).then((response) => response.item),
  stats: () => api.stats.get(),
  create: (input) => api.items.create(input).then((response) => response.item),
  update: (id, patch) => api.items.update(id, patch).then((response) => response.item),
  delete: (id) => api.items.remove(id).then(() => true),
};

const CatalogueSourceContext = createContext<CatalogueSource | null>(null);

export function CatalogueSourceProvider({ source, children }: { source: CatalogueSource; children: ReactNode }) {
  return <CatalogueSourceContext.Provider value={source}>{children}</CatalogueSourceContext.Provider>;
}

export function useCatalogueSource(): CatalogueSource {
  const source = useContext(CatalogueSourceContext);
  if (!source) throw new Error("useCatalogueSource must be used inside CatalogueSourceProvider");
  return source;
}
