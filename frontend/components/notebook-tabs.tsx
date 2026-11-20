"use client";

import { usePathname } from "next/navigation";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

export function NotebookTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const records = pathname === "/items" || pathname.startsWith("/items/");
  const tiers = pathname === "/tiers" || pathname.startsWith("/tiers/");
  const liked = pathname === "/liked";

  return (
    <nav aria-label={t("nav.notebook")} className="notebook-tabs">
      <AppLink aria-current={records ? "page" : undefined} href="/items">
        {t("nav.items")}
      </AppLink>
      <AppLink aria-current={!records && !tiers && !liked ? "page" : undefined} href="/collections">
        {t("nav.collections")}
      </AppLink>
      <AppLink aria-current={tiers ? "page" : undefined} href="/tiers">
        {t("nav.tiers")}
      </AppLink>
      <AppLink aria-current={liked ? "page" : undefined} href="/liked">
        {t("nav.liked")}
      </AppLink>
    </nav>
  );
}
