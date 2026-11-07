import { api } from "@/lib/api";
import type { Collection } from "@/lib/types";

export interface CollectionSource {
  list(): Promise<Collection[]>;
  create(input: { title: string; visibility: "private" | "public" }): Promise<unknown>;
  update(
    id: string,
    input: { title: string; visibility: "private" | "public" },
  ): Promise<unknown>;
  remove(id: string): Promise<unknown>;
}

export const httpCollectionSource: CollectionSource = {
  list: () => api.collections.list().then((response) => response.collections),
  create: (input) => api.collections.create(input),
  update: (id, input) => api.collections.update(id, input),
  remove: (id) => api.collections.remove(id),
};
