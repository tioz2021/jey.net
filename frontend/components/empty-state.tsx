import Link from "next/link";
import type { ReactNode } from "react";

import {
  RecordsIllustration,
  SearchIllustration,
  StatsIllustration,
  TagsIllustration,
  TrashIllustration,
} from "./illustrations";
import styles from "./empty-state.module.css";

const ILLUSTRATIONS = {
  records: RecordsIllustration,
  search: SearchIllustration,
  tags: TagsIllustration,
  stats: StatsIllustration,
  trash: TrashIllustration,
};

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
  variant,
}: {
  title: string;
  text?: string;
  actionHref?: string;
  actionLabel?: string;
  action?: ReactNode;
  variant?: keyof typeof ILLUSTRATIONS;
}) {
  const Illustration = variant ? ILLUSTRATIONS[variant] : null;

  return (
    <div className={styles.state}>
      {Illustration ? (
        <div className={styles.illustration}>
          <Illustration />
        </div>
      ) : null}
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
