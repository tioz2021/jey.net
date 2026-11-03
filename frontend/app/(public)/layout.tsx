import type { ReactNode } from "react";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

import styles from "./layout.module.css";

/** Public pages (landing, shared profiles, legal) have a light classic header. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <PublicHeader />

      <main className={styles.main}>{children}</main>

      <PublicFooter />
    </div>
  );
}
