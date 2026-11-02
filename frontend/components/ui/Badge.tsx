import type { ReactNode } from "react";

import styles from "./Badge.module.css";

type Tone = "neutral" | "accent" | "success" | "danger";

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
}

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
