import type { Metadata } from "next";

import { CollectionManager } from "@/components/collection-manager";
import { PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "collections.title")} — jey.net` };
}

export default async function CollectionsPage() {
  const locale = await getServerLocale();
  return (
    <main>
      <PageHeader title={translate(locale, "collections.title")} />
      <CollectionManager />
    </main>
  );
}
