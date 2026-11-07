import type { Item, ItemPatch, NewItem } from "@/lib/types";

import type { ItemSource } from "./source";

/** Reserved for the future web-hosted desktop build. */
export const httpSource: ItemSource = {
  async list() { return []; },
  async search() { return []; },
  async create(_input: NewItem) { throw new Error("HTTP source is not configured"); },
  async update(_id: string, _patch: ItemPatch): Promise<Item | null> { return null; },
  async delete(_id: string) { return false; },
};
