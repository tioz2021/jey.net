"use client";

import { ItemForm } from "@/components/forms/item-form";
import { Card, PageHeader } from "@/components/ui";
import type { Item, ItemKind } from "@/lib/types";

/** Shared create/edit screen; the host decides how to load the initial item. */
export function ItemFormScreen({
  initial,
  itemId,
  initialKind,
  lockKind,
}: {
  initial?: Item;
  itemId?: string;
  initialKind?: ItemKind;
  lockKind?: ItemKind;
}) {
  return (
    <main>
      <PageHeader title={itemId ? "Редактировать запись" : "Добавить запись"} />
      <Card>
        <ItemForm initial={initial} initialKind={initialKind} itemId={itemId} lockKind={lockKind} />
      </Card>
    </main>
  );
}
