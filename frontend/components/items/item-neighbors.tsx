"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import styles from "./item-neighbors.module.css";

/** Previous/next links plus the left/right arrow keys. */
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
    <nav aria-label="Переход между записями" className={styles.pager}>
      {prevHref ? (
        <Link className={styles.link} href={prevHref}>
          ← Предыдущая
        </Link>
      ) : (
        <span />
      )}
      {nextHref ? (
        <Link className={styles.link} href={nextHref}>
          Следующая →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
