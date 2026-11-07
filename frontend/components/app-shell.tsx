"use client";

import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { SiteHeader } from "@/components/site-header";

import styles from "./app-shell.module.css";

/** Shared authenticated shell for Next and the Vite SPA. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className={styles.shell}>
        <AppNav />
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
}
