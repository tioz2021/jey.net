"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/profile/avatar";
import { QuickAdd } from "@/components/quick-add";
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
                <form action="/items" className={styles.search} method="get" role="search">
                  <label className="visually-hidden" htmlFor="global-search">
                    Поиск по записям
                  </label>
                  <svg
                    aria-hidden="true"
                    className={styles.searchIcon}
                    fill="none"
                    height="14"
                    viewBox="0 0 24 24"
                    width="14"
                  >
                    <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
                    <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <input
                    className={styles.searchInput}
                    id="global-search"
                    name="q"
                    placeholder="Поиск"
                    type="search"
                  />
                </form>
                <QuickAdd />
                <ThemeToggle />
              </div>

              <div className={styles.account}>
                <Link className={styles.user} href="/settings">
                  <Avatar
                    url={user.avatar_key ? `/media/${user.avatar_key}` : null}
                    name={user.display_name}
                  />
                  <span className={styles.name}>{user.display_name}</span>
                </Link>
                <LogoutButton />
              </div>
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
