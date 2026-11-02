import type { ReactNode } from "react";

import styles from "./Card.module.css";

export interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** A bordered block with an optional header bar — the base layout unit. */
export function Card({ title, children, className }: CardProps) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(" ")}>
      {title ? (
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
        </div>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
