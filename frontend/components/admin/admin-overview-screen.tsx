"use client";

import { useEffect, useState } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { Card, PageHeader } from "@/components/ui";
import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";
import type { AnalyticsAudience, AnalyticsSummary, Report } from "@/lib/types";

import shell from "./admin-shell.module.css";
import styles from "./admin-overview.module.css";

interface ReportsResponse { reports: Report[]; history?: Report[] }

async function json<T>(path: string): Promise<T | null> {
  const response = await fetch(path, { credentials: "include" });
  return response.ok ? ((await response.json()) as T) : null;
}

export function AdminOverviewScreen() {
  const { t, locale } = useI18n();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [audience, setAudience] = useState<AnalyticsAudience | null>(null);
  const [reports, setReports] = useState<ReportsResponse | null>(null);

  useEffect(() => {
    Promise.all([
      json<AnalyticsSummary>("/api/v1/analytics/summary?days=7"),
      json<AnalyticsAudience>("/api/v1/analytics/audience"),
      json<ReportsResponse>("/api/v1/reports"),
    ]).then(([nextSummary, nextAudience, nextReports]) => {
      setSummary(nextSummary);
      setAudience(nextAudience);
      setReports(nextReports ?? { reports: [] });
    });
  }, []);

  const counts = summary?.counts ?? {};
  const dateTime = (value: string | null) =>
    value ? new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
  const cards = [
    [t("admin.online"), String(audience?.stats.online ?? 0), "/admin/people"],
    [t("admin.users"), String(audience?.stats.total_users ?? 0), "/admin/people"],
    [t("admin.newUsers"), String(audience?.stats.new_7d ?? 0), "/admin/people"],
    [t("admin.openReports"), String(reports?.reports.length ?? 0), "/admin/reports"],
    [t("admin.views7"), String(counts.page_view ?? 0), "/admin/analytics"],
    [t("admin.items7"), String(counts.item_created ?? 0), "/admin/analytics"],
  ] as const;

  return (
    <div className={shell.shell}>
      <AdminNav />
      <main className={shell.body}>
        <PageHeader subtitle={t("admin.subtitle")} title={t("admin.title")} />
        <section className={styles.cards} aria-label={t("admin.title")}>
          {cards.map(([label, value, href]) => (
            <AppLink className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong></AppLink>
          ))}
        </section>
        <div className={styles.two}>
          <Card title={t("admin.online")} action={<AppLink href="/admin/people">{t("admin.allPeople")}</AppLink>}>
            {!audience || audience.online.length === 0 ? <p className={styles.muted}>{t("analytics.onlineEmpty")}</p> : (
              <ul className={styles.list}>{audience.online.slice(0, 6).map((person) => (
                <li key={person.id}><span className={styles.dot} /><strong>{person.display_name}</strong><code>{person.last_path ?? "/"}</code><small>{dateTime(person.last_seen_at)}</small></li>
              ))}</ul>
            )}
          </Card>
          <Card title={t("admin.latestUsers")} action={<AppLink href="/admin/people">{t("admin.allPeople")}</AppLink>}>
            {!audience || audience.registrations.length === 0 ? <p className={styles.muted}>{t("admin.noUsers")}</p> : (
              <ul className={styles.list}>{audience.registrations.slice(0, 6).map((person) => (
                <li key={person.id}><strong>{person.display_name}</strong><code>{person.email}</code><small>{dateTime(person.created_at)}</small></li>
              ))}</ul>
            )}
          </Card>
        </div>
        <Card title={t("admin.latestReports")} action={<AppLink href="/admin/reports">{t("admin.allReports")}</AppLink>}>
          {!reports || reports.reports.length === 0 ? <p className={styles.muted}>{t("admin.noReports")}</p> : (
            <ul className={styles.list}>{reports.reports.slice(0, 5).map((report) => (
              <li key={report.id}><strong>{report.reason}</strong><code>{report.target_type}</code><small>{dateTime(report.created_at)}</small></li>
            ))}</ul>
          )}
        </Card>
      </main>
    </div>
  );
}
