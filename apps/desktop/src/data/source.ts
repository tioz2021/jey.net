import type { Item, ItemPatch, NewItem } from "@/lib/types";

export interface ItemSource {
  list(query?: string): Promise<Item[]>;
  create(input: NewItem): Promise<Item>;
  update(id: string, patch: ItemPatch): Promise<Item | null>;
  delete(id: string): Promise<boolean>;
}

export interface LocalItem extends Item {
  pending?: boolean;
}
