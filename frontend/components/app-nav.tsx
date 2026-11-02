"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import styles from "./app-nav.module.css";

const KINDS = [
  { kind: null, label: "Все записи" },
  { kind: "movie", label: "Фильмы" },
  { kind: "book", label: "Книги" },
  { kind: "image", label: "Картинки" },
  { kind: "other", label: "Другое" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeKind = params.get("kind");
  const onItems = pathname === "/items";

  return (
    <aside className={styles.nav} aria-label="Типы записей">
      <p className={styles.groupTitle}>Типы</p>

      {KINDS.map(({ kind, label }) => {
        const active = onItems && (kind === null ? !activeKind : activeKind === kind);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`${styles.link} ${active ? styles.active : ""}`}
            href={kind ? `/items?kind=${kind}` : "/items"}
            key={label}
          >
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
