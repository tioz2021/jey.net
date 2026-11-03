import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { EmptyTrashButton } from "@/components/trash/empty-trash-button";
import { TrashList } from "@/components/trash/trash-list";
import { Card, PageHeader } from "@/components/ui";
import { backendFetch } from "@/lib/server-api";
import type { ItemList } from "@/lib/types";

export const metadata: Metadata = {
  title: "Корзина — jey.net",
};

export default async function TrashPage() {
  const response = await backendFetch("/items?only_deleted=true&limit=100", {
    cache: "no-store",
  });

  if (!response.ok) {
    return (
      <main>
        <Card title="Не удалось загрузить корзину">
          <p>Попробуйте обновить страницу позже.</p>
        </Card>
      </main>
    );
  }

  const { items } = (await response.json()) as ItemList;

  return (
    <main>
      <PageHeader
        action={items.length > 0 ? <EmptyTrashButton count={items.length} /> : undefined}
        subtitle={
          items.length > 0
            ? `Записей в корзине: ${items.length}`
            : "Здесь будут записи, которые вы удалили"
        }
        title="Корзина"
      />

      {items.length === 0 ? (
        <EmptyState
          actionHref="/items"
          actionLabel="К записям"
          text="Удалённые записи попадают сюда и остаются, пока вы не восстановите их или не очистите корзину."
          title="Корзина пуста"
          variant="trash"
        />
      ) : (
        <Card title="Удалённые записи">
          <TrashList items={items} />
        </Card>
      )}
    </main>
  );
}
