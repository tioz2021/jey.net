import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /** CSS width, e.g. "12rem" or "60%". */
  width?: string;
  /** CSS height; defaults to one text line. */
  height?: string;
}

export function Skeleton({ width = "100%", height = "1rem" }: SkeletonProps) {
  return (
    <span
      className={styles.skeleton}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
