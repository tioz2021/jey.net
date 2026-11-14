"use client";

import { usePathname } from "next/navigation";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

export function FeedTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const isFeed = pathname === "/feed";
  const isGeneral = pathname === "/recommendations/all";
  const isFriends = !isFeed && !isGeneral;

  return (
    <nav aria-label={t("nav.feed")} className="notebook-tabs">
      <AppLink aria-current={isFeed ? "page" : undefined} href="/feed">
        {t("feed.newsTab")}
      </AppLink>
      <AppLink aria-current={isFriends ? "page" : undefined} href="/recommendations">
        {t("feed.friendsTab")}
      </AppLink>
      <AppLink aria-current={isGeneral ? "page" : undefined} href="/recommendations/all">
        {t("feed.generalTab")}
      </AppLink>
    </nav>
  );
}
