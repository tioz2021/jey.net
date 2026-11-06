import type { ReactNode } from "react";

import styles from "./detail-group.module.css";

/** A quiet heading that groups related blocks on a record page. */
export function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
