import { useCssStyle } from "@/lib/use-css-style";

import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /** CSS width, e.g. "12rem" or "60%". */
  width?: string;
  /** CSS height; defaults to one text line. */
  height?: string;
}

export function Skeleton({ width = "100%", height = "1rem" }: SkeletonProps) {
  const ref = useCssStyle<HTMLSpanElement>({ width, height });
  return <span aria-hidden="true" className={styles.skeleton} ref={ref} />;
}
