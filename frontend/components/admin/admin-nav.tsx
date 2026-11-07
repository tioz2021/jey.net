"use client";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

import styles from "./admin-shell.module.css";

const LINKS = [
  { href: "/admin", key: "admin.overview", exact: true },
  { href: "/admin/reports", key: "admin.reports" },
  { href: "/admin/people", key: "admin.people" },
  { href: "/admin/analytics", key: "admin.analytics" },
  { href: "/admin/audit", key: "admin.audit" },
  { href: "/admin/system", key: "admin.system" },
  { href: "/admin/errors", key: "admin.errors" },
  { href: "/admin/site", key: "admin.site" },
] as const;

export function AdminNav() {
  const { t } = useI18n();
  const pathname = typeof window === "undefined" ? "/admin" : window.location.pathname.replace(/^\/spa/, "");
  return (
    <nav aria-label={t("admin.title")} className={styles.nav}>
      {LINKS.map((link) => {
        const exact = "exact" in link && link.exact;
        const active = exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <AppLink aria-current={active ? "page" : undefined} className={`${styles.tab} ${active ? styles.active : ""}`} href={link.href} key={link.href}>
            {t(link.key)}
          </AppLink>
        );
      })}
    </nav>
  );
}
