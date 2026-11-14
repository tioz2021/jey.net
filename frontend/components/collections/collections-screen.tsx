"use client";

import { CollectionManager } from "@/components/collection-manager";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import { NotebookTabs } from "@/components/notebook-tabs";

export function CollectionsScreen() {
  const { t } = useI18n();
  return (
    <main>
      <NotebookTabs />
      <PageHeader title={t("collections.title")} />
      <CollectionManager />
    </main>
  );
}
