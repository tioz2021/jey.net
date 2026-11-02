import type { ReactNode } from "react";

import styles from "./layout.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className={styles.main}>{children}</main>;
}
