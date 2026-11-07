"use client";

import type { ReactNode } from "react";

import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppLink } from "@/lib/navigation";

import styles from "./auth-shell.module.css";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <AppLink className={styles.brand} href="/">
            <Logo size={22} />
            <span>jey.net</span>
          </AppLink>
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
