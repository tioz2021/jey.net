"use client";

import { ItemEditorClient } from "@/components/items/item-editor-client";
import { httpClientSource } from "@/lib/client-source";

export default function NewItemPage() {
  return <ItemEditorClient backHref="/items" source={httpClientSource} />;
}
