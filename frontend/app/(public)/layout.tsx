import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./layout.module.css";

/** Public pages (shared profiles) have their own minimal header. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          jey
        </Link>
        <Link className={styles.login} href="/login">
          Войти
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
    </>
  );
}
