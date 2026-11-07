import type { Metadata } from "next";

import { CollectionsClient } from "@/components/collections/collections-client";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "collections.title")} — jey.net` };
}

export default function CollectionsPage() {
  return <CollectionsClient />;
}
