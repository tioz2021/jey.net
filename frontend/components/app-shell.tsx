"use client";

import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { SiteHeader } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import { useUser } from "@/lib/user-context";

import styles from "./app-shell.module.css";

/** Shared authenticated shell for Next and the Vite SPA. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useUser();
  return (
    <>
      <div className={styles.desktopHeader}>
        <SiteHeader />
      </div>
      <div className={styles.shell}>
        <AppNav />
        <div className={styles.content}>
          {user ? <div className={styles.topProfile}><UserMenu user={user} /></div> : null}
          {children}
        </div>
      </div>
    </>
  );
}
