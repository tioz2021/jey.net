"use client";

import { ItemForm } from "@/components/forms/item-form";
import { useAppRouter } from "@/lib/navigation";
import { Button, Card, PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
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
  const router = useAppRouter();
  const { t } = useI18n();

  return (
    <main>
      <PageHeader
        action={
          <Button
            onClick={() => router.push(itemId ? `/items/${itemId}` : "/items")}
            size="sm"
            variant="secondary"
          >
            ← {t("common.back")}
          </Button>
        }
        title={itemId ? "Редактировать запись" : "Добавить запись"}
      />
      <Card>
        <ItemForm initial={initial} initialKind={initialKind} itemId={itemId} lockKind={lockKind} />
      </Card>
    </main>
  );
}
