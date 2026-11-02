import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

import styles from "./layout.module.css";

// Login and registration never belong in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
