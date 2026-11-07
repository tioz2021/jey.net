"use client";

import { useEffect, useState } from "react";

import { Card, PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { SystemErrorsResponse } from "@/lib/types";

import styles from "./admin-errors.module.css";
import { LoadingScreen } from "@/components/loading-screen";

export function AdminErrorsScreen() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<SystemErrorsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/errors?days=7", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <main><PageHeader title={t("admin.errors")} /><Card><p>Нет доступа</p></Card></main>;
  if (!data) return <main><LoadingScreen /></main>;

  const dateTime = (value: string) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

  return (
    <main>
      <PageHeader subtitle={t("admin.errorsSubtitle")} title={t("admin.errors")} />
      <Card title={t("admin.errorsLast", { count: data.total })}>
        {data.errors.length === 0 ? <p>Ошибок нет</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>{t("admin.status")}</th><th>{t("admin.path")}</th><th>{t("admin.occurrences")}</th><th>{t("admin.firstSeen")}</th><th>{t("admin.lastSeen")}</th><th>request_id</th></tr></thead>
              <tbody>{data.errors.map((row) => (
                <tr key={`${row.path}-${row.status}`}><td><span className={styles.code}>{row.status}</span></td><td><code>{row.path}</code></td><td>{row.count}</td><td>{dateTime(row.first_seen)}</td><td>{dateTime(row.last_seen)}</td><td><code>{row.last_request_id ?? "—"}</code></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
