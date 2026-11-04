"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HeaderSearch } from "@/components/header-search";
import { LanguageSwitch } from "@/components/language-switch";
import { MobileMenu } from "@/components/mobile-menu";
import { FeedBadge } from "@/components/feed-badge";
import { Logo } from "@/components/logo";
import {
  IconList,
  IconSettings,
  IconStats,
} from "@/components/icons";
import { QuickAdd } from "@/components/quick-add";
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
  { href: "/feed", labelKey: "nav.feed", Icon: IconList },
  { href: "/dashboard", labelKey: "nav.stats", Icon: IconStats },
  { href: "/settings", labelKey: "nav.settings", Icon: IconSettings },
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
                <div className={styles.search}>
                <HeaderSearch />
              </div>
                <QuickAdd />
                <ThemeToggle />
              </div>

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
