"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { EmptyTrashButton } from "@/components/trash/empty-trash-button";
import { TrashList } from "@/components/trash/trash-list";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { AppLink } from "@/lib/navigation";
import type { Item } from "@/lib/types";

import styles from "./trash-screen.module.css";
import { LoadingScreen } from "@/components/loading-screen";

export function TrashScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api.items.list({ only_deleted: true, limit: 100 }).then((response) => setItems(response.items)).catch(() => setError(true));
  }, [version]);

  if (error) return <main><Card title={t("trash.errorTitle")}><p>{t("trash.errorText")}</p></Card></main>;
  if (!items) return <main><LoadingScreen /></main>;

  return (
    <main>
      <p><AppLink href="/items">← К записям</AppLink></p>
      <PageHeader
        action={items.length > 0 ? <EmptyTrashButton count={items.length} /> : undefined}
        subtitle={items.length > 0 ? t("trash.subtitle", { count: items.length }) : t("trash.subtitleEmpty")}
        title={t("page.trash")}
      />
      <p className={styles.note}>{t("trash.retention")}</p>
      {items.length === 0 ? (
        <EmptyState actionHref="/items" actionLabel={t("trash.emptyAction")} text={t("trash.emptyText")} title={t("trash.emptyTitle")} variant="trash" />
      ) : (
        <Card title={t("trash.deletedTitle")}><TrashList items={items} onChanged={() => setVersion((value) => value + 1)} /></Card>
      )}
    </main>
  );
}
