import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./empty-state.module.css";

/**
 * One shape for every "nothing here" screen: title, explanation and a way
 * forward (a link or a custom action such as a retry button).
 */
export function EmptyState({
  title,
  text,
  actionHref,
  actionLabel,
  action,
}: {
  title: string;
  text?: string;
  actionHref?: string;
  actionLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.state}>
      <p className={styles.title}>{title}</p>
      {text ? <p className={styles.text}>{text}</p> : null}

      {actionHref && actionLabel ? (
        <Link className={styles.action} href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
      {action ? <div className={styles.actionWrapper}>{action}</div> : null}
    </div>
  );
}
