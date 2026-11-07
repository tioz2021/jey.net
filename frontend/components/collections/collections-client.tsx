"use client";

import { CollectionManager } from "@/components/collection-manager";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { CollectionSource } from "@/lib/collection-source";

/** Client-owned collections screen; no server component data needed. */
export function CollectionsClient({
  source,
  showLinks = true,
}: {
  source?: CollectionSource;
  showLinks?: boolean;
} = {}) {
  const { t } = useI18n();
  return (
    <main>
      <PageHeader title={t("collections.title")} />
      <CollectionManager showLinks={showLinks} source={source} />
    </main>
  );
}
