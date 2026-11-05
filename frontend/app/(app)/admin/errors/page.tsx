import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { SystemErrorsResponse } from "@/lib/types";

import styles from "./errors.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "admin.errors")} — jey.net` };
}

export default async function AdminErrorsPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const response = await backendFetch("/admin/errors?days=7");
  if (!response.ok) {
    return (
      <main>
        <PageHeader title={t("admin.errors")} />
        <Card><p className={styles.muted}>{t("analytics.noAccess")}</p></Card>
      </main>
    );
  }
  const data = (await response.json()) as SystemErrorsResponse;
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(
      locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU",
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
    ).format(new Date(value));

  return (
    <main>
      <PageHeader subtitle={t("admin.errorsSubtitle")} title={t("admin.errors")} />
      <Card title={t("admin.errorsLast", { count: data.total })}>
        {data.errors.length === 0 ? (
          <p className={styles.muted}>{t("admin.errorsEmpty")}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("admin.status")}</th>
                  <th>{t("admin.path")}</th>
                  <th>{t("admin.occurrences")}</th>
                  <th>{t("admin.firstSeen")}</th>
                  <th>{t("admin.lastSeen")}</th>
                  <th>request_id</th>
                </tr>
              </thead>
              <tbody>
                {data.errors.map((row) => (
                  <tr key={`${row.path}-${row.status}`}>
                    <td><span className={styles.code}>{row.status}</span></td>
                    <td><code>{row.path}</code></td>
                    <td>{row.count}</td>
                    <td>{dateTime(row.first_seen)}</td>
                    <td>{dateTime(row.last_seen)}</td>
                    <td><code>{row.last_request_id ?? "—"}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
