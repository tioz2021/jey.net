import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { AnalyticsAudience, AnalyticsSummary } from "@/lib/types";

import styles from "./analytics.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "analytics.title")} — jey.net` };
}

export default async function AnalyticsPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const [response, audienceResponse] = await Promise.all([
    backendFetch("/analytics/summary?days=30"),
    backendFetch("/analytics/audience"),
  ]);

  if (!response.ok || !audienceResponse.ok) {
    return (
      <main>
        <PageHeader title={t("analytics.title")} />
        <Card>
          <p className={styles.muted}>{t("analytics.noAccess")}</p>
        </Card>
      </main>
    );
  }

  const data = (await response.json()) as AnalyticsSummary;
  const audience = (await audienceResponse.json()) as AnalyticsAudience;
  const counts = data.counts ?? {};
  const views = counts.page_view ?? 0;
  const registrations = counts.registration ?? 0;
  const itemsCreated = counts.item_created ?? 0;
  const profileViews = counts.profile_viewed ?? 0;
  const publicItemViews = counts.public_item_viewed ?? 0;
  const maxViews = Math.max(...data.daily.map((day) => day.views), 1);
  const maxPath = Math.max(...data.paths.map((row) => row.count), 1);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU", {
      day: "numeric",
      month: "short",
    }).format(new Date(value));
  const percent = (part: number, whole: number) =>
    whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
  const dateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(
          locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU",
          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
        ).format(new Date(value))
      : "—";

  return (
    <main>
      <PageHeader
        subtitle={t("analytics.subtitle")}
        title={t("analytics.title")}
      />

      <section className={styles.cards} aria-label={t("analytics.title")}>
        <div className={styles.stat}>
          <span>{t("analytics.views")}</span>
          <strong>{views.toLocaleString(locale)}</strong>
        </div>
        <div className={styles.stat}>
          <span>{t("analytics.registrations")}</span>
          <strong>{registrations.toLocaleString(locale)}</strong>
        </div>
        <div className={styles.stat}>
          <span>{t("analytics.itemsCreated")}</span>
          <strong>{itemsCreated.toLocaleString(locale)}</strong>
        </div>
        <div className={styles.stat}>
          <span>{t("analytics.profileViews")}</span>
          <strong>{profileViews.toLocaleString(locale)}</strong>
        </div>
      </section>

      <Card title={t("analytics.daily")}>
        {data.daily.length === 0 ? (
          <p className={styles.muted}>{t("analytics.empty")}</p>
        ) : (
          <div className={styles.chart} aria-label={t("analytics.daily")}>
            {data.daily.map((day) => (
              <div className={styles.column} key={day.date}>
                <span
                  className={styles.bar}
                  style={{ height: `${Math.max(3, (day.views / maxViews) * 100)}%` }}
                  title={`${date(day.date)}: ${day.views}`}
                />
                <small>{date(day.date)}</small>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t("analytics.funnel")}>
        <ol className={styles.funnel}>
          <li><span>{t("analytics.views")}</span><strong>{views}</strong></li>
          <li><span>{t("analytics.registrations")}</span><strong>{registrations}</strong><em>{percent(registrations, views)}</em></li>
          <li><span>{t("analytics.itemsCreated")}</span><strong>{itemsCreated}</strong><em>{percent(itemsCreated, registrations)}</em></li>
          <li><span>{t("analytics.publicItemViews")}</span><strong>{publicItemViews}</strong><em>{percent(publicItemViews, views)}</em></li>
        </ol>
      </Card>

      <Card title={t("analytics.audience")}>
        <div className={styles.audienceStats}>
          <span><strong>{audience.stats.online}</strong> {t("analytics.online")}</span>
          <span><strong>{audience.stats.total_users}</strong> {t("analytics.totalUsers")}</span>
          <span><strong>{audience.stats.new_7d}</strong> {t("analytics.newUsers")}</span>
        </div>
        <h3 className={styles.subhead}>{t("analytics.online")}</h3>
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
        <h3 className={styles.subhead}>{t("analytics.recentUsers")}</h3>
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

      <div className={styles.two}>
        <Card title={t("analytics.topPages")}>
          <ul className={styles.rows}>
            {data.paths.map((row) => (
              <li key={row.path}>
                <code>{row.path}</code>
                <span className={styles.rowBar}>
                  <i style={{ width: `${(row.count / maxPath) * 100}%` }} />
                </span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("analytics.events")}>
          <ul className={styles.rows}>
            {Object.entries(counts)
              .sort(([, left], [, right]) => right - left)
              .map(([name, count]) => (
                <li key={name}>
                  <code>{name}</code>
                  <strong>{count}</strong>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
