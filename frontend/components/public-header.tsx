"use client";

import { AppLink } from "@/lib/navigation";

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
  if (authenticated || user) {
    return <SiteHeader />;
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <AppLink className={styles.brand} href="/">
          <Logo size={22} />
          <span>jey.net</span>
        </AppLink>

        <nav className={styles.nav} aria-label="Основное">
          <AppLink className={styles.navLink} href="/">
            {t("public.home")}
          </AppLink>
          <LanguageSwitch />
          <AppLink className={styles.cta} href="/login">
            {t("public.login")}
          </AppLink>
        </nav>
      </div>
    </header>
  );
}
