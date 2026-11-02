"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/profile/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUser } from "@/lib/user-context";

import { LogoutButton } from "./logout-button";
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

        <form action="/items" className={styles.search} method="get" role="search">
          <label className="visually-hidden" htmlFor="global-search">
            Поиск по записям
          </label>
          <input
            className={styles.searchInput}
            id="global-search"
            name="q"
            placeholder="Поиск по записям"
            type="search"
          />
        </form>

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
          <span className={styles.theme}>
            <ThemeToggle />
          </span>
          {loading ? null : user ? (
            <>
              <Link className={styles.user} href="/settings">
                <Avatar
                  url={user.avatar_key ? `/media/${user.avatar_key}` : null}
                  name={user.display_name}
                />
                <span className={styles.name}>{user.display_name}</span>
              </Link>
              <LogoutButton />
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
