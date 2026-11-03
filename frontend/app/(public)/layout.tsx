import Link from "next/link";
import type { ReactNode } from "react";

import { PublicFooter } from "@/components/public-footer";

import styles from "./layout.module.css";

/** Public pages (landing, shared profiles, legal) have a light classic header. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link className={styles.brand} href="/">
            jey.net
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

      <main className={styles.main}>{children}</main>

      <PublicFooter />
    </div>
  );
}
