import Link from "next/link";

import styles from "./quick-add.module.css";

/** A one-click shortcut to the full "new record" page. */
export function QuickAdd() {
  return (
    <Link
      aria-label="Добавить запись"
      className={styles.button}
      href="/items/new"
      title="Добавить запись"
    >
      +
    </Link>
  );
}
