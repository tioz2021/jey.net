"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HeaderSearch } from "@/components/header-search";
import { Logo } from "@/components/logo";
import {
  IconList,
  IconSettings,
  IconStats,
  IconTag,
} from "@/components/icons";
import { QuickAdd } from "@/components/quick-add";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUser } from "@/lib/user-context";

import { UserMenu } from "@/components/user-menu";
import styles from "./site-header.module.css";

const SECTIONS = [
  { href: "/items", label: "Записи", Icon: IconList },
  { href: "/tags", label: "Теги", Icon: IconTag },
  { href: "/dashboard", label: "Статистика", Icon: IconStats },
  { href: "/settings", label: "Настройки", Icon: IconSettings },
];

export function SiteHeader() {
  const { user, loading } = useUser();
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/items">
          <Logo size={22} />
          <span>jey.net</span>
        </Link>

        <nav className={styles.nav} aria-label="Разделы">
          {SECTIONS.map(({ href, label, Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                href={href}
                key={href}
              >
                <Icon size={14} />
                {label}
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
