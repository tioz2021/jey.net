import type { Metadata } from "next";

import { LegalArticle } from "@/components/legal-article";
import { getServerLocale } from "@/lib/i18n/server";
import { LEGAL } from "@/lib/i18n/legal";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const content = LEGAL.privacy[locale];

  return {
    title: `${content.title} — jey.net`,
    description: content.description,
  };
}

export default async function PrivacyPage() {
  const locale = await getServerLocale();

  return <LegalArticle locale={locale} page="privacy" />;
}
