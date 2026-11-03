import type { Metadata } from "next";

import { LegalArticle } from "@/components/legal-article";
import { getServerLocale } from "@/lib/i18n/server";
import { LEGAL } from "@/lib/i18n/legal";
import { languageAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const content = LEGAL.terms[locale];

  return {
    title: `${content.title} — jey.net`,
    description: content.description,
    alternates: {
      canonical: "/terms",
      languages: languageAlternates("/terms"),
    },
  };
}

export default async function TermsPage() {
  const locale = await getServerLocale();

  return <LegalArticle locale={locale} page="terms" />;
}
