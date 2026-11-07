import type { CatalogItem } from "@/components/items/catalog-page";
import { api } from "@/lib/api";
import type { ItemPatch, NewItem } from "@/lib/types";

export interface ClientSource {
  list(): Promise<CatalogItem[]>;
  search(query: string): Promise<CatalogItem[]>;
  get(id: string): Promise<CatalogItem | null>;
  create(input: NewItem): Promise<CatalogItem>;
  update(id: string, patch: ItemPatch): Promise<CatalogItem | null>;
  delete(id: string): Promise<boolean>;
}

/** Browser data source for the shared catalogue. */
export const httpClientSource: ClientSource = {
  async list() {
    const response = await api.items.list({ limit: 100 });
    return response.items;
  },
  async search(query) {
    const response = await api.items.list({ q: query, limit: 100 });
    return response.items;
  },
  async get(id) {
    try {
      const response = await api.items.get(id);
      return response.item;
    } catch {
      return null;
    }
  },
  async create(input) {
    const response = await api.items.create(input);
    return response.item;
  },
  async update(id, patch) {
    const response = await api.items.update(id, patch);
    return response.item;
  },
  async delete(id) {
    await api.items.remove(id);
    return true;
  },
};
