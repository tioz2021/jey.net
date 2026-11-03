import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { EmptyTrashButton } from "@/components/trash/empty-trash-button";
import { TrashList } from "@/components/trash/trash-list";
import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { ItemList } from "@/lib/types";

export const metadata: Metadata = {
  title: "Корзина — jey.net",
};

export default async function TrashPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
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
            ? t("trash.subtitle", { count: items.length })
            : t("trash.subtitleEmpty")
        }
        title={t("page.trash")}
      />

      {items.length === 0 ? (
        <EmptyState
          actionHref="/items"
          actionLabel={t("trash.emptyAction")}
          text={t("trash.emptyText")}
          title={t("trash.emptyTitle")}
          variant="trash"
        />
      ) : (
        <Card title={t("trash.deletedTitle")}>
          <TrashList items={items} />
        </Card>
      )}
    </main>
  );
}
