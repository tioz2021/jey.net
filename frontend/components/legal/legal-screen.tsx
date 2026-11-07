"use client";

import { LegalArticle } from "@/components/legal-article";
import { useI18n } from "@/lib/locale-context";

export function LegalScreen({ page }: { page: "privacy" | "terms" }) {
  const { locale } = useI18n();
  return <main><LegalArticle locale={locale} page={page} /></main>;
}
