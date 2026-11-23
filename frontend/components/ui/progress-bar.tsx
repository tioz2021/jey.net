"use client";

import { useCssStyle } from "@/lib/use-css-style";

import styles from "./progress-bar.module.css";

export function ProgressBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, percent));
  const ref = useCssStyle<HTMLDivElement>({ width: `${value}%` });
  return <div aria-hidden="true" className={`${styles.bar} ${className ?? ""}`} ref={ref} />;
}

export function HeightBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, percent));
  const ref = useCssStyle<HTMLDivElement>({ height: `${value}%` });
  return <div aria-hidden="true" className={`${styles.bar} ${className ?? ""}`} ref={ref} />;
}
