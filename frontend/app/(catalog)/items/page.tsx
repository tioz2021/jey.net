import type { Metadata } from "next";

import { CatalogClient } from "@/components/items/catalog-client";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "page.items")} — jey.net` };
}

export default function ItemsPage() {
  return <CatalogClient />;
}
