"use client";

import { usePathname } from "next/navigation";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

export function NotebookTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const records = pathname === "/items" || pathname.startsWith("/items/");
  const tiers = pathname === "/tiers" || pathname.startsWith("/tiers/");

  return (
    <nav aria-label={t("nav.notebook")} className="notebook-tabs">
      <AppLink aria-current={records ? "page" : undefined} href="/items">
        {t("nav.items")}
      </AppLink>
      <AppLink aria-current={!records && !tiers ? "page" : undefined} href="/collections">
        {t("nav.collections")}
      </AppLink>
      <AppLink aria-current={tiers ? "page" : undefined} href="/tiers">
        {t("nav.tiers")}
      </AppLink>
    </nav>
  );
}
