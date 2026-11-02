"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./app-nav.module.css";

const MAIN = [
  { href: "/items", label: "Записи" },
  { href: "/tags", label: "Теги" },
  { href: "/dashboard", label: "Статистика" },
];

const ACCOUNT = [{ href: "/settings", label: "Настройки" }];

export function AppNav() {
  const pathname = usePathname();

  const link = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);

    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={`${styles.link} ${active ? styles.active : ""}`}
        href={href}
        key={href}
      >
        {label}
      </Link>
    );
  };

  return (
    <aside className={styles.nav} aria-label="Навигация по разделам">
      <p className={styles.groupTitle}>Каталог</p>
      {MAIN.map((item) => link(item.href, item.label))}

      <Link className={styles.add} href="/items/new">
        Добавить запись
      </Link>

      <p className={styles.groupTitle}>Аккаунт</p>
      {ACCOUNT.map((item) => link(item.href, item.label))}
    </aside>
  );
}
