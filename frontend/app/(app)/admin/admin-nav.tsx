"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/lib/locale-context";

import styles from "./admin.module.css";

const LINKS = [
  { href: "/admin", key: "admin.overview", exact: true },
  { href: "/admin/reports", key: "admin.reports" },
  { href: "/admin/people", key: "admin.people" },
  { href: "/admin/analytics", key: "admin.analytics" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav aria-label={t("admin.title")} className={styles.nav}>
      {LINKS.map((link) => {
        const exact = "exact" in link && link.exact;
        const active = exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`${styles.tab} ${active ? styles.active : ""}`}
            href={link.href}
            key={link.href}
          >
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
