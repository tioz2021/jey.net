"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import styles from "./item-neighbors.module.css";

/**
 * Two fixed slots, so the control never jumps when a neighbour is missing.
 * Keyboard: ← and →.
 */
export function ItemNeighbors({
  prevHref,
  nextHref,
}: {
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target &&
        (target.closest("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowLeft" && prevHref) {
        event.preventDefault();
        router.push(prevHref);
      } else if (event.key === "ArrowRight" && nextHref) {
        event.preventDefault();
        router.push(nextHref);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prevHref, nextHref, router]);

  if (!prevHref && !nextHref) {
    return null;
  }

  return (
    <nav aria-label="Переход между записями (клавиши ← и →)" className={styles.pager}>
      {prevHref ? (
        <Link className={styles.link} href={prevHref} title="Предыдущая запись (←)">
          ← Предыдущая
        </Link>
      ) : (
        <span aria-disabled="true" className={styles.disabled}>
          ← Предыдущая
        </span>
      )}

      {nextHref ? (
        <Link className={styles.link} href={nextHref} title="Следующая запись (→)">
          Следующая →
        </Link>
      ) : (
        <span aria-disabled="true" className={styles.disabled}>
          Следующая →
        </span>
      )}
    </nav>
  );
}
