import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

import styles from "./layout.module.css";

// Login and registration never belong in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link className={styles.brand} href="/">
            jey.net
          </Link>
          <nav className={styles.links} aria-label="Аккаунт">
            <Link href="/login">Вход</Link>
            <Link href="/register">Регистрация</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
