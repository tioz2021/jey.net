"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LanguageSwitch } from "@/components/language-switch";
import { MobileMenu } from "@/components/mobile-menu";
import { FeedBadge } from "@/components/feed-badge";
import { Logo } from "@/components/logo";
import {
  IconCollection,
  IconFeed,
  IconList,
  IconPeople,
  IconSparkles,
} from "@/components/icons";
import { NotificationBell } from "@/components/notification-bell";
import { QuickAdd } from "@/components/quick-add";
import { DesktopSync } from "@/components/desktop-sync";
import { ThemeToggle } from "@/components/theme-toggle";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import type { TranslationKey } from "@/lib/i18n";

import { UserMenu } from "@/components/user-menu";
import styles from "./site-header.module.css";

const SECTIONS: Array<{
  href: string;
  labelKey: TranslationKey;
  Icon: typeof IconList;
}> = [
  { href: "/items", labelKey: "nav.items", Icon: IconList },
  { href: "/collections", labelKey: "nav.collections", Icon: IconCollection },
  { href: "/feed", labelKey: "nav.feed", Icon: IconFeed },
  { href: "/recommendations", labelKey: "nav.recommendations", Icon: IconSparkles },
  { href: "/people", labelKey: "nav.people", Icon: IconPeople },
];

export function SiteHeader() {
  const { user, loading } = useUser();
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/items">
          <Logo size={22} />
          <span>jey.net</span>
        </Link>

        <MobileMenu />

        <nav className={styles.nav} aria-label="Разделы">
          {SECTIONS.map(({ href, labelKey, Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                href={href}
                key={href}
                title={
                  href === "/feed"
                    ? t("nav.feedHint")
                    : href === "/recommendations"
                      ? t("nav.recommendationsHint")
                      : undefined
                }
              >
                <Icon size={14} />
                {t(labelKey)}
                {href === "/feed" ? <FeedBadge /> : null}
              </Link>
            );
          })}
        </nav>

        <div className={styles.right}>
          {loading ? null : user ? (
            <>
              <div className={styles.tools}>
                <QuickAdd />
                <DesktopSync />
                <ThemeToggle />
              </div>

              <NotificationBell />
              <div className={styles.language}>
                <LanguageSwitch />
              </div>
              <UserMenu user={user} />
            </>
          ) : (
            <Link className={styles.link} href="/login">
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
