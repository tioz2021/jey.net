import type { MonthCount } from "@/lib/types";

import styles from "./month-chart.module.css";

const monthFormat = new Intl.DateTimeFormat("ru-RU", { month: "short" });

function shortMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }

  return monthFormat.format(new Date(year, month - 1, 1));
}

/**
 * Twelve vertical bars. The container scrolls on narrow screens instead of
 * squeezing twelve labels into 360 px.
 */
export function MonthChart({ data }: { data: MonthCount[] }) {
  const max = Math.max(1, ...data.map((item) => item.count));

  return (
    <div className={styles.scroller}>
      <ul className={styles.chart} aria-label="Записи по месяцам">
        {data.map((item) => (
          <li key={item.month} className={styles.bar}>
            <span className={styles.count}>{item.count}</span>
            <span
              className={styles.column}
              style={{ height: `${Math.round((item.count / max) * 100)}%` }}
              title={`${shortMonth(item.month)}: ${item.count}`}
            />
            <span className={styles.month}>{shortMonth(item.month)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
