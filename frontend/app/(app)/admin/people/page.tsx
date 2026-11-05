import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { AnalyticsAudience } from "@/lib/types";

import styles from "./people.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "admin.people")} — jey.net` };
}

export default async function AdminPeoplePage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const response = await backendFetch("/analytics/audience");
  if (!response.ok) {
    return (
      <main>
        <PageHeader title={t("admin.people")} />
        <Card><p className={styles.muted}>{t("analytics.noAccess")}</p></Card>
      </main>
    );
  }
  const audience = (await response.json()) as AnalyticsAudience;
  const dateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(
          locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU",
          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
        ).format(new Date(value))
      : "—";

  return (
    <main>
      <PageHeader subtitle={t("admin.peopleSubtitle")} title={t("admin.people")} />
      <section className={styles.stats}>
        <div><strong>{audience.stats.online}</strong><span>{t("analytics.online")}</span></div>
        <div><strong>{audience.stats.total_users}</strong><span>{t("analytics.totalUsers")}</span></div>
        <div><strong>{audience.stats.public_users}</strong><span>{t("admin.publicUsers")}</span></div>
        <div><strong>{audience.stats.new_7d}</strong><span>{t("analytics.newUsers")}</span></div>
      </section>

      <Card title={t("analytics.online")}>
        {audience.online.length === 0 ? (
          <p className={styles.muted}>{t("analytics.onlineEmpty")}</p>
        ) : (
          <ul className={styles.people}>
            {audience.online.map((person) => (
              <li key={person.id}>
                <span className={styles.dot} aria-hidden="true" />
                <strong>{person.display_name}</strong>
                <code>{person.last_path ?? "/"}</code>
                <small>{dateTime(person.last_seen_at)}</small>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("analytics.recentUsers")}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("analytics.name")}</th>
                <th>{t("analytics.email")}</th>
                <th>{t("analytics.registered")}</th>
                <th>{t("analytics.items")}</th>
                <th>{t("analytics.lastSeen")}</th>
              </tr>
            </thead>
            <tbody>
              {audience.registrations.map((person) => (
                <tr key={person.id}>
                  <td>
                    {person.display_name}
                    {person.is_admin ? <span className={styles.role}>admin</span> : null}
                    {!person.is_public ? <span className={styles.role}>{t("analytics.private")}</span> : null}
                  </td>
                  <td>{person.email}</td>
                  <td>{dateTime(person.created_at)}</td>
                  <td>{person.items}</td>
                  <td>{dateTime(person.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
