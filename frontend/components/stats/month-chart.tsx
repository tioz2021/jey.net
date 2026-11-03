"use client";

import Link from "next/link";
import { useState } from "react";

import type { MonthCount } from "@/lib/types";

import styles from "./month-chart.module.css";

const monthFormat = new Intl.DateTimeFormat("ru-RU", { month: "short" });
const longMonthFormat = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

function shortMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }

  return monthFormat.format(new Date(year, month - 1, 1));
}

function longMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }

  return longMonthFormat.format(new Date(year, month - 1, 1));
}

/**
 * Twelve vertical bars. The container scrolls on narrow screens instead of
 * squeezing twelve labels into 360 px.
 */
export function MonthChart({ data }: { data: MonthCount[] }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const [active, setActive] = useState<MonthCount | null>(null);

  return (
    <>
    <div className={styles.scroller}>
      <ul className={styles.chart} aria-label="Записи по месяцам">
        {data.map((item) => (
          <li key={item.month} className={styles.bar}>
            <Link
              aria-label={`Записи за ${longMonth(item.month)}: ${item.count}`}
              className={styles.link}
              href={`/items?month=${item.month}`}
              onBlur={() => setActive(null)}
              onFocus={() => setActive(item)}
              onMouseEnter={() => setActive(item)}
              onMouseLeave={() => setActive(null)}
            >
              <span className={styles.count}>{item.count}</span>
              <span
                className={styles.column}
                style={{ height: `${Math.round((item.count / max) * 100)}%` }}
              />
              <span className={styles.month}>{shortMonth(item.month)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>

    <p aria-live="polite" className={styles.detail}>
      {active
        ? `${longMonth(active.month)} — ${active.count} записей`
        : `Всего за 12 месяцев: ${total}`}
    </p>
    </>
  );
}
