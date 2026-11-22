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
  const { pathname, search } = useLocation();
  const { t } = useI18n();
  if (pathname === "/items" || pathname.startsWith("/items/")) {
    const kind = new URLSearchParams(search).get("kind");
    const href = kind && ["movie", "tv", "anime", "book", "game", "image", "other"].includes(kind)
      ? `/items/new?kind=${encodeURIComponent(kind)}`
      : "/items/new";
    return (
      <AppLink aria-label={t("common.add")} className={styles.contextCreate} href={href} title={t("common.add")}>
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
  const { t } = useI18n();

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
  const controlsInTabs = pathname === "/items" || pathname === "/liked" || pathname === "/collections" || pathname === "/feed" || pathname.startsWith("/recommendations") || pathname === "/people" || pathname.startsWith("/collections/") || pathname.startsWith("/tiers") || pathname === "/messages";
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("app.skip")}
      </a>
      <div className={styles.desktopHeader}>
        <SiteHeader />
      </div>
      <div className={styles.shell}>
        <AppNav />
        <div className={styles.content} id="main-content" tabIndex={-1}>
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
