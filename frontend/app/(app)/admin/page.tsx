import Link from "next/link";

import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { AnalyticsAudience, AnalyticsSummary, Report } from "@/lib/types";

import styles from "./page.module.css";

interface ReportsResponse {
  reports: Report[];
  history?: Report[];
}

export default async function AdminOverviewPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const [summaryResponse, audienceResponse, reportsResponse] = await Promise.all([
    backendFetch("/analytics/summary?days=7"),
    backendFetch("/analytics/audience"),
    backendFetch("/reports"),
  ]);
  const summary = summaryResponse.ok
    ? ((await summaryResponse.json()) as AnalyticsSummary)
    : null;
  const audience = audienceResponse.ok
    ? ((await audienceResponse.json()) as AnalyticsAudience)
    : null;
  const reports = reportsResponse.ok
    ? ((await reportsResponse.json()) as ReportsResponse)
    : null;
  const counts = summary?.counts ?? {};
  const dateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(
          locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU",
          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
        ).format(new Date(value))
      : "—";
  const cards = [
    [t("admin.online"), String(audience?.stats.online ?? 0), "/admin/people"],
    [t("admin.users"), String(audience?.stats.total_users ?? 0), "/admin/people"],
    [t("admin.newUsers"), String(audience?.stats.new_7d ?? 0), "/admin/people"],
    [t("admin.openReports"), String(reports?.reports.length ?? 0), "/admin/reports"],
    [t("admin.views7"), String(counts.page_view ?? 0), "/admin/analytics"],
    [t("admin.items7"), String(counts.item_created ?? 0), "/admin/analytics"],
  ] as const;

  return (
    <main>
      <PageHeader subtitle={t("admin.subtitle")} title={t("admin.title")} />
      <section className={styles.cards} aria-label={t("admin.title")}>
        {cards.map(([label, value, href]) => (
          <Link className={styles.card} href={href} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </Link>
        ))}
      </section>

      <div className={styles.two}>
        <Card
          title={t("admin.online")}
          action={<Link href="/admin/people">{t("admin.allPeople")}</Link>}
        >
          {!audience || audience.online.length === 0 ? (
            <p className={styles.muted}>{t("analytics.onlineEmpty")}</p>
          ) : (
            <ul className={styles.list}>
              {audience.online.slice(0, 6).map((person) => (
                <li key={person.id}>
                  <span className={styles.dot} />
                  <strong>{person.display_name}</strong>
                  <code>{person.last_path ?? "/"}</code>
                  <small>{dateTime(person.last_seen_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title={t("admin.latestUsers")}
          action={<Link href="/admin/people">{t("admin.allPeople")}</Link>}
        >
          {!audience || audience.registrations.length === 0 ? (
            <p className={styles.muted}>{t("admin.noUsers")}</p>
          ) : (
            <ul className={styles.list}>
              {audience.registrations.slice(0, 6).map((person) => (
                <li key={person.id}>
                  <strong>{person.display_name}</strong>
                  <code>{person.email}</code>
                  <small>{dateTime(person.created_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title={t("admin.latestReports")}
        action={<Link href="/admin/reports">{t("admin.allReports")}</Link>}
      >
        {!reports || reports.reports.length === 0 ? (
          <p className={styles.muted}>{t("admin.noReports")}</p>
        ) : (
          <ul className={styles.list}>
            {reports.reports.slice(0, 5).map((report) => (
              <li key={report.id}>
                <strong>{report.reason}</strong>
                <code>{report.target_type}</code>
                <small>{dateTime(report.created_at)}</small>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
