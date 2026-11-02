import type { ReactNode } from "react";

import styles from "./Card.module.css";

export interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A bordered block with an optional header bar — the base layout unit. */
export function Card({ title, action, children, className }: CardProps) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(" ")}>
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
