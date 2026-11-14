"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { DesktopSync } from "@/components/desktop-sync";
import { FeedBadge } from "@/components/feed-badge";
import { IconFeed, IconList, IconPeople } from "@/components/icons";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { useI18n } from "@/lib/locale-context";
import { AppLink } from "@/lib/navigation";
import { useUser } from "@/lib/user-context";
import { api } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

import styles from "./app-nav.module.css";

const DOMAINS: Array<{ href: string; labelKey: TranslationKey; Icon: typeof IconList }> = [
  { href: "/items", labelKey: "nav.notebook", Icon: IconList },
  { href: "/feed", labelKey: "nav.feed", Icon: IconFeed },
  { href: "/people", labelKey: "nav.subscriptions", Icon: IconPeople },
];

function domainActive(pathname: string, href: string) {
  if (href === "/items") {
    return pathname === "/items" || pathname.startsWith("/items/") || pathname === "/collections" || pathname.startsWith("/collections/");
  }
  if (href === "/feed") {
    return pathname === "/feed" || pathname.startsWith("/recommendations");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const { t } = useI18n();
  const { user } = useUser();
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ notebook: number; subscriptions: number }>({ notebook: 0, subscriptions: 0 });

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    api.stats
      .get()
      .then((stats) => {
        if (!cancelled) setCounts((current) => ({ ...current, notebook: stats.total }));
      })
      .catch(() => {});
    api.follows
      .following()
      .then((response) => {
        if (!cancelled) setCounts((current) => ({ ...current, subscriptions: response.people.length }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className={styles.column}>
      <aside className={styles.nav} aria-label={t("nav.notebook")}>
        <div className={styles.brandRow}>
          <AppLink className={styles.brand} href="/items">
            <Logo size={22} />
            <span>jey.net</span>
          </AppLink>
          {user ? <NotificationBell /> : null}
        </div>

        <nav className={styles.domains} aria-label={t("nav.menu")}>
          {DOMAINS.map(({ href, labelKey, Icon }) => {
            const active = domainActive(pathname, href);
            return (
              <AppLink
                aria-current={active ? "page" : undefined}
                className={`${styles.domainLink} ${active ? styles.domainActive : ""}`}
                href={href}
                key={href}
              >
                <Icon size={17} />
                {t(labelKey)}
                {href === "/feed" ? <FeedBadge /> : null}
                {href === "/items" ? <span className={styles.domainCount}>{counts.notebook}</span> : null}
                {href === "/people" ? <span className={styles.domainCount}>{counts.subscriptions}</span> : null}
              </AppLink>
            );
          })}
        </nav>

        <AppLink className={styles.create} href="/items/new">
          <span className={styles.createLabel}>{t("common.add")}</span>
          <span aria-hidden="true" className={styles.createIcon}>
            <svg fill="none" height="15" viewBox="0 0 24 24" width="15">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
            </svg>
          </span>
        </AppLink>

        <div className={styles.tools}>
          <DesktopSync withLabel />
        </div>

        {user ? (
          <div className={styles.profile}>
            <UserMenu menuAlign="left" user={user} />
          </div>
        ) : null}

      </aside>
    </div>
  );
}
