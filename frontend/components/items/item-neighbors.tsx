"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useI18n } from "@/lib/locale-context";

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
  const { t } = useI18n();

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
    <nav aria-label={t("item.previous")} className={styles.pager}>
      {prevHref ? (
        <Link className={styles.link} href={prevHref} title="Предыдущая запись (←)">
          {t("item.previous")}
        </Link>
      ) : (
        <span aria-disabled="true" className={styles.disabled}>
          {t("item.previous")}
        </span>
      )}

      {nextHref ? (
        <Link className={styles.link} href={nextHref} title="Следующая запись (→)">
          {t("item.next")}
        </Link>
      ) : (
        <span aria-disabled="true" className={styles.disabled}>
          {t("item.next")}
        </span>
      )}
    </nav>
  );
}
