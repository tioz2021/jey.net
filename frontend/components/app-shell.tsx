"use client";

import { useEffect, type ReactNode } from "react";

import { useLocation } from "react-router-dom";

import { AppNav } from "@/components/app-nav";
import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";
import { LanguageSwitch } from "@/components/language-switch";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { getPageCache, setPageCache } from "@/lib/page-cache";

import styles from "./app-shell.module.css";

/** Shared authenticated shell for Next and the Vite SPA. */
function ContextCreate() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  if (pathname === "/items" || pathname.startsWith("/items/")) {
    return (
      <AppLink aria-label={t("common.add")} className={styles.contextCreate} href="/items/new" title={t("common.add")}>
        <span aria-hidden="true" className={styles.contextPlus}>+</span>
      </AppLink>
    );
  }
  if (pathname === "/collections") {
    return (
      <button
        aria-label={t("collections.create")}
        className={styles.contextCreate}
        onClick={() => window.dispatchEvent(new Event("jey:create-collection"))}
        title={t("collections.create")}
        type="button"
      >
        <span aria-hidden="true" className={styles.contextPlus}>+</span>
      </button>
    );
  }
  if (pathname === "/tiers") {
    return (
      <button
        aria-label={t("tiers.create")}
        className={styles.contextCreate}
        onClick={() => window.dispatchEvent(new Event("jey:create-tier"))}
        title={t("tiers.create")}
        type="button"
      >
        <span aria-hidden="true" className={styles.contextPlus}>+</span>
      </button>
    );
  }
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!getPageCache("collections")) {
      void api.collections.list()
        .then((response) => setPageCache("collections", response.collections))
        .catch(() => {});
    }
    if (!getPageCache("tier-lists")) {
      void api.tierLists.list()
        .then((response) => setPageCache("tier-lists", response.tier_lists))
        .catch(() => {});
    }
  }, []);
  const controlsInTabs = pathname === "/items" || pathname === "/collections" || pathname === "/feed" || pathname.startsWith("/recommendations") || pathname === "/people" || pathname.startsWith("/collections/") || pathname.startsWith("/tiers") || pathname === "/messages";
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
            <ContextCreate />
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
