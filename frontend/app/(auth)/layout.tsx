import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

import styles from "./layout.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.main}>
      <div className={styles.corner}>
        <ThemeToggle />
      </div>
      {children}
    </main>
  );
}
