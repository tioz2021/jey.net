"use client";

import { CollectionManager } from "@/components/collection-manager";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

export function CollectionsScreen() {
  const { t } = useI18n();
  return (
    <main>
      <PageHeader title={t("collections.title")} />
      <CollectionManager />
    </main>
  );
}
