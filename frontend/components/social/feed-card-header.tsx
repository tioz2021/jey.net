"use client";

import type { ReactNode } from "react";

import { Avatar } from "@/components/profile/avatar";

import styles from "./feed-card-header.module.css";

export function FeedCardHeader({
  avatars,
  children,
  score,
  actions,
}: {
  avatars: Array<{ name: string; url?: string | null }>;
  children: ReactNode;
  score?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.avatars}>
        {avatars.slice(0, 3).map((person, index) => (
          <Avatar key={`${person.name}-${index}`} name={person.name} size={24} url={person.url} />
        ))}
      </div>
      <p className={styles.text}>{children}</p>
      {score ? <span className={styles.score}>{score}</span> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
