"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/logo";
import { useUser } from "@/lib/user-context";

import { SiteHeader } from "./site-header";
import styles from "./public-header.module.css";

/**
 * Public pages use the light guest header. A signed-in visitor on a profile
 * keeps the application header instead, so "Моя страница" does not look like
 * the site suddenly logged them out.
 */
export function PublicHeader() {
  const { user } = useUser();
  const pathname = usePathname();

  if (user && pathname.startsWith("/u/")) {
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
            Главная
          </Link>
          <Link className={styles.navLink} href="/login">
            Войти
          </Link>
          <Link className={styles.cta} href="/register">
            Регистрация
          </Link>
        </nav>
      </div>
    </header>
  );
}
