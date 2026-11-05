"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import styles from "./audit.module.css";

/**
 * A table with a horizontal scrollbar above it as well as below. The top bar
 * is a proxy that keeps the real table and the visible scrollbar in sync.
 */
export function ScrollTable({ children }: { children: ReactNode }) {
  const top = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const topElement = top.current;
    const tableElement = table.current;
    if (!topElement || !tableElement) return;
    const inner = topElement.firstElementChild as HTMLElement | null;
    const sync = () => {
      if (inner) inner.style.width = `${tableElement.scrollWidth}px`;
      topElement.scrollLeft = tableElement.scrollLeft;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(tableElement);
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div className={styles.scrollBlock}>
      <div
        aria-hidden="true"
        className={styles.topScroll}
        onScroll={(event) => {
          if (table.current) table.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        ref={top}
      >
        <div className={styles.topScrollInner} />
      </div>
      <div
        className={styles.tableWrap}
        onScroll={(event) => {
          if (top.current) top.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        ref={table}
      >
        {children}
      </div>
    </div>
  );
}
