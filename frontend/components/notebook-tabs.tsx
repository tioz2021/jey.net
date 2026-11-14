"use client";

import { usePathname } from "next/navigation";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

export function NotebookTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const records = pathname === "/items" || pathname.startsWith("/items/");

  return (
    <nav aria-label={t("nav.notebook")} className="notebook-tabs">
      <AppLink aria-current={records ? "page" : undefined} href="/items">
        {t("nav.items")}
      </AppLink>
      <AppLink aria-current={!records ? "page" : undefined} href="/collections">
        {t("nav.collections")}
      </AppLink>
    </nav>
  );
}
