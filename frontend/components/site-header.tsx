"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HeaderSearch } from "@/components/header-search";
import { QuickAdd } from "@/components/quick-add";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUser } from "@/lib/user-context";

import { UserMenu } from "@/components/user-menu";
import styles from "./site-header.module.css";

const SECTIONS = [
  { href: "/items", label: "Записи" },
  { href: "/tags", label: "Теги" },
  { href: "/dashboard", label: "Статистика" },
  { href: "/settings", label: "Настройки" },
];

export function SiteHeader() {
  const { user, loading } = useUser();
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/items">
          jey.net
        </Link>

        <nav className={styles.nav} aria-label="Разделы">
          {SECTIONS.map((section) => {
            const active =
              pathname === section.href || pathname.startsWith(`${section.href}/`);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                href={section.href}
                key={section.href}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.right}>
          {loading ? null : user ? (
            <>
              <div className={styles.tools}>
                <HeaderSearch />
                <QuickAdd />
                <ThemeToggle />
              </div>

              <UserMenu user={user} />
            </>
          ) : (
            <Link className={styles.link} href="/login">
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
