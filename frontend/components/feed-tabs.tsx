"use client";

import { usePathname } from "next/navigation";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

export function FeedTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const feed = pathname === "/feed";

  return (
    <nav aria-label={t("nav.feed")} className="notebook-tabs">
      <AppLink aria-current={feed ? "page" : undefined} href="/feed">
        {t("nav.feed")}
      </AppLink>
      <AppLink aria-current={!feed ? "page" : undefined} href="/recommendations">
        {t("nav.recommendations")}
      </AppLink>
    </nav>
  );
}
