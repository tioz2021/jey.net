"use client";

import Link from "next/link";
import { useState } from "react";

import { useI18n } from "@/lib/locale-context";
import type { MonthCount } from "@/lib/types";

import styles from "./month-chart.module.css";



/**
 * Twelve vertical bars. The container scrolls on narrow screens instead of
 * squeezing twelve labels into 360 px.
 */
export function MonthChart({ data }: { data: MonthCount[] }) {
  const { t, date } = useI18n();
  const max = Math.max(1, ...data.map((item) => item.count));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const [active, setActive] = useState<MonthCount | null>(null);

  function monthLabel(value: string, long = false): string {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) {
      return value;
    }

    return date(new Date(year, month - 1, 1), {
      month: long ? "long" : "short",
      year: long ? "numeric" : undefined,
    });
  }

  return (
    <>
    <div className={styles.scroller}>
      <ul className={styles.chart} aria-label="Записи по месяцам">
        {data.map((item) => (
          <li key={item.month} className={styles.bar}>
            <Link
              aria-label={t("dashboard.monthAria", {
                month: monthLabel(item.month, true),
                count: item.count,
              })}
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
              <span className={styles.month}>{monthLabel(item.month)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>

    <p aria-live="polite" className={styles.detail}>
      {active
        ? t("dashboard.monthValue", {
            month: monthLabel(active.month, true),
            count: active.count,
          })
        : t("dashboard.monthsTotal", { count: total })}
    </p>
    </>
  );
}
