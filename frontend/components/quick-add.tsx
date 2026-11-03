"use client";

import Link from "next/link";

import { useI18n } from "@/lib/locale-context";

import styles from "./quick-add.module.css";

/** A one-click shortcut to the full "new record" page. */
export function QuickAdd() {
  const { t } = useI18n();

  return (
    <Link
      aria-label={t("quickAdd")}
      className={styles.button}
      href="/items/new"
      title={t("quickAdd")}
    >
      +
    </Link>
  );
}
