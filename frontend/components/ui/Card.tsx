import type { ReactNode } from "react";

import styles from "./Card.module.css";

export interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: boolean;
}

/** A bordered block with an optional header bar — the base layout unit. */
export function Card({
  title,
  action,
  children,
  className,
  accent = false,
}: CardProps) {
  return (
    <section
      className={[styles.card, accent ? styles.accented : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {title || action ? (
        <div className={styles.head}>
          {title ? <h2 className={styles.title}>{title}</h2> : <span />}
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
