"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import { SiteHeader } from "./site-header";
import styles from "./public-header.module.css";

/**
 * Public pages use the light guest header. A signed-in visitor on a profile
 * keeps the application header instead, so "Моя страница" does not look like
 * the site suddenly logged them out.
 */
export function PublicHeader({ authenticated = false }: { authenticated?: boolean }) {
  const { user } = useUser();
  const { t } = useI18n();
  const pathname = usePathname();

  if ((authenticated || user) && (pathname.startsWith("/u/") || pathname.startsWith("/cart/"))) {
    return <SiteHeader />;
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          <Logo size={22} />
          <span>jey.net</span>
        </Link>

        <nav className={styles.nav} aria-label="Основное">
          <Link className={styles.navLink} href="/">
            {t("public.home")}
          </Link>
          <LanguageSwitch />
          <Link className={styles.cta} href="/login">
            {t("public.login")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
