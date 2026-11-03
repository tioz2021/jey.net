import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
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
            <Logo size={22} />
            <span>jey.net</span>
          </Link>
          <div className={styles.links}>
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
