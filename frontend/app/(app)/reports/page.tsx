"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";
import type { Report } from "@/lib/types";

import styles from "./reports.module.css";

const REASON_KEYS: Record<string, TranslationKey> = {
  spam: "report.reason.spam",
  abuse: "report.reason.abuse",
  spoilers: "report.reason.spoilers",
  other: "report.reason.other",
};
const TARGET_KEYS: Record<string, TranslationKey> = {
  item: "report.target.item",
  comment: "report.target.comment",
  profile: "report.target.profile",
};

export default function ReportsPage() {
  const { t, date } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.reports
      .list()
      .then((response) => setReports(response.reports))
      .catch(() => setError(t("reports.forbidden")))
      .finally(() => setLoading(false));
  }, [t]);

  async function resolve(id: string, status: "resolved" | "dismissed") {
    setBusy(id);
    try {
      await api.reports.resolve(id, status);
      setReports((current) => current.filter((report) => report.id !== id));
    } catch {
      setError(t("reports.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <PageHeader title={t("reports.title")} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <Card>
        {!loading && reports.length === 0 && !error ? (
          <EmptyState text={t("reports.emptyText")} title={t("reports.emptyTitle")} />
        ) : (
          <ul className={styles.list}>
            {reports.map((report) => (
              <li className={styles.item} key={report.id}>
                <div>
                  <p className={styles.head}>
                    <strong>{t(REASON_KEYS[report.reason] ?? "report.reason.other")}</strong>
                    <span>{date(report.created_at)}</span>
                  </p>
                  <p className={styles.target}>
                    {t(TARGET_KEYS[report.target_type] ?? "report.target.item")}: {report.target_label}
                  </p>
                  <p className={styles.meta}>
                    {t("reports.reporter", { name: report.reporter_name })}
                  </p>
                  {report.details ? <p className={styles.details}>{report.details}</p> : null}
                </div>
                <div className={styles.actions}>
                  <Button
                    loading={busy === report.id}
                    onClick={() => void resolve(report.id, "resolved")}
                    size="sm"
                  >
                    {t("reports.resolve")}
                  </Button>
                  <Button
                    onClick={() => void resolve(report.id, "dismissed")}
                    size="sm"
                    variant="secondary"
                  >
                    {t("reports.dismiss")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
