"use client";

import type { ReactNode } from "react";

import { useLocation } from "react-router-dom";

import { AppNav } from "@/components/app-nav";
import { LanguageSwitch } from "@/components/language-switch";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";

import styles from "./app-shell.module.css";

/** Shared authenticated shell for Next and the Vite SPA. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const controlsInTabs = pathname === "/items" || pathname === "/collections" || pathname === "/feed" || pathname.startsWith("/recommendations") || pathname === "/people" || pathname.startsWith("/collections/");
  return (
    <>
      <div className={styles.desktopHeader}>
        <SiteHeader />
      </div>
      <div className={styles.shell}>
        <AppNav />
        <div className={styles.content}>
          <div className={`${styles.topControls} ${controlsInTabs ? styles.topControlsInTabs : ""}`}>
            <ThemeToggle />
            <LanguageSwitch />
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
