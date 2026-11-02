/* eslint-disable @next/next/no-img-element -- 128 px WebP served by our API */
import styles from "./avatar.module.css";

export function Avatar({
  url,
  name,
  size = 28,
}: {
  url?: string | null;
  name: string;
  size?: number;
}) {
  const style = { width: size, height: size };
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (url) {
    return (
      <img
        className={styles.avatar}
        style={style}
        src={url}
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <span className={styles.fallback} style={style} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
