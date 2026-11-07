"use client";

import { useEffect, useState } from "react";

import { Card, PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { AnalyticsSummary } from "@/lib/types";

import styles from "./admin-analytics.module.css";

export function AdminAnalyticsScreen() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/analytics/summary?days=30", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <main><PageHeader title={t("analytics.title")} /><Card><p>Нет доступа</p></Card></main>;
  if (!data) return <main><p>Загрузка…</p></main>;

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

    <section className={styles.cards} aria-label={t("analytics.retention")}>
      <div className={styles.stat}>
        <span>{t("analytics.unique7")}</span>
        <strong>{data.retention.unique_7d}</strong>
      </div>
      <div className={styles.stat}>
        <span>{t("analytics.unique30")}</span>
        <strong>{data.retention.unique_30d}</strong>
      </div>
      <div className={styles.stat}>
        <span>{t("analytics.new7")}</span>
        <strong>{data.retention.new_7d}</strong>
      </div>
      <div className={styles.stat}>
        <span>{t("analytics.returning7")}</span>
        <strong>{data.retention.returning_7d}</strong>
      </div>
    </section>

    <Card title={t("analytics.rateLimit")}>
      <p className={styles.muted}>{t("analytics.rateLimitHint")}</p>
      <div className={styles.rateLimit}>
        <span><strong>{data.rate_limit.active_blocks}</strong>{t("analytics.activeBlocks")}</span>
        <span><strong>{data.rate_limit.tracked}</strong>{t("analytics.trackedIps")}</span>
        <span><strong>{data.rate_limit.max_attempts}</strong>{t("analytics.maxAttempts")}</span>
        <span><strong>{data.rate_limit.drops_today}</strong>{t("analytics.dropsToday")}</span>
        <span><strong>{data.rate_limit.drops_7d}</strong>{t("analytics.drops7d")}</span>
      </div>
    </Card>

    <Card title={t("analytics.daily")}>
      {data.daily.length === 0 ? (
        <p className={styles.muted}>{t("analytics.empty")}</p>
      ) : (
        <div className={styles.chart} aria-label={t("analytics.daily")}>
          <div className={styles.bars}>
            {data.daily.map((day) => (
              <div className={styles.column} key={day.date}>
                <span
                  className={styles.bar}
                  style={{ height: `${Math.max(3, (day.views / maxViews) * 100)}%` }}
                  title={`${date(day.date)}: ${day.views}`}
                />
              </div>
            ))}
          </div>
          <div className={styles.axis} aria-hidden="true">
            {data.daily
              .filter((_, index) => index % 5 === 0 || index === data.daily.length - 1)
              .map((day) => <span key={day.date}>{date(day.date)}</span>)}
          </div>
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

    <Card title={t("analytics.cohorts")}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("analytics.cohort")}</th>
              <th>{t("analytics.registered")}</th>
              <th>{t("analytics.addedItem")}</th>
              <th>{t("analytics.returned")}</th>
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((row) => (
              <tr key={row.cohort}>
                <td>{date(row.cohort)}</td>
                <td>{row.registered}</td>
                <td>{row.added_item}</td>
                <td>{row.returned}</td>
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
