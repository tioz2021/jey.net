"use client";

import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { LanguageSwitch } from "@/components/language-switch";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";

import styles from "./app-shell.module.css";

/** Shared authenticated shell for Next and the Vite SPA. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.desktopHeader}>
        <SiteHeader />
      </div>
      <div className={styles.shell}>
        <AppNav />
        <div className={styles.content}>
          <div className={styles.topControls}>
            <ThemeToggle />
            <LanguageSwitch />
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
