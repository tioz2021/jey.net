"use client";

import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";

import styles from "./admin-shell.module.css";

export function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <AdminNav />
      <div className={styles.body}><main>{children}</main></div>
    </div>
  );
}
