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
    <section aria-label={title} className={styles.group}>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
