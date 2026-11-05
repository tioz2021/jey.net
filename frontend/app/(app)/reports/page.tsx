"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge, Button, Card, Dialog, PageHeader } from "@/components/ui";
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

type Action = "archive" | "resolved" | "dismissed";

export default function ReportsPage() {
  const { t, date } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [history, setHistory] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "history">("open");
  const [pending, setPending] = useState<{ report: Report; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setError(null);
    setLoading(true);
    api.reports
      .list()
      .then((response) => {
        setReports(response.reports);
        setHistory(response.history ?? []);
      })
      .catch(() => setError(t("reports.forbidden")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only once on mount
  }, []);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      const status =
        pending.action === "archive"
          ? "archived"
          : pending.action === "dismissed"
            ? "dismissed"
            : "resolved";
      await api.reports.resolve(pending.report.id, status);
      setPending(null);
      load();
    } catch {
      setError(t("reports.error"));
    } finally {
      setBusy(false);
    }
  }

  async function restore(report: Report) {
    try {
      await api.reports.resolve(report.id, "restore");
      load();
    } catch {
      setError(t("reports.error"));
    }
  }

  async function reopen(report: Report) {
    try {
      await api.reports.resolve(report.id, "open");
      load();
    } catch {
      setError(t("reports.error"));
    }
  }

  function targetLink(report: Report) {
    return report.target_url ? (
      <Link className={styles.targetLink} href={report.target_url}>
        {report.target_label}
      </Link>
    ) : (
      <span>
        {report.target_label}{" "}
        <Badge tone="neutral">
          {report.status === "archived"
            ? t("reports.targetArchived")
            : t("reports.targetGone")}
        </Badge>
      </span>
    );
  }

  const visible = tab === "open" ? reports : history;

  return (
    <main>
      <PageHeader title={t("reports.title")} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.tabs}>
        <button className={tab === "open" ? styles.tabActive : styles.tab} onClick={() => setTab("open")} type="button">
          {t("reports.open")} ({reports.length})
        </button>
        <button className={tab === "history" ? styles.tabActive : styles.tab} onClick={() => setTab("history")} type="button">
          {t("reports.history")} ({history.length})
        </button>
      </div>
      <Card>
        {!loading && visible.length === 0 ? (
          <EmptyState
            text={tab === "open" ? t("reports.emptyText") : t("reports.historyEmpty")}
            title={tab === "open" ? t("reports.emptyTitle") : t("reports.historyTitle")}
          />
        ) : (
          <ul className={styles.list}>
            {visible.map((report) => (
              <li className={styles.item} key={report.id}>
                <div>
                  <p className={styles.head}>
                    <strong>{t(REASON_KEYS[report.reason] ?? "report.reason.other")}</strong>
                    <span>{date(report.created_at)}</span>
                    {report.status !== "open" ? (
                      <Badge
                        tone={
                          report.status === "resolved"
                            ? "success"
                            : report.status === "archived"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {t(
                          report.status === "resolved"
                            ? "reports.resolved"
                            : report.status === "archived"
                              ? "reports.archived"
                              : "reports.dismissed",
                        )}
                      </Badge>
                    ) : null}
                  </p>
                  <p className={styles.target}>
                    {t(TARGET_KEYS[report.target_type] ?? "report.target.item")}: {targetLink(report)}
                  </p>
                  <p className={styles.meta}>
                    {t("reports.reporter", { name: report.reporter_name })}
                  </p>
                  {report.details ? <p className={styles.details}>{report.details}</p> : null}
                </div>
                {tab === "open" ? (
                  <div className={styles.actions}>
                    <Button onClick={() => setPending({ report, action: "archive" })} size="sm">
                      {t("reports.archive")}
                    </Button>
                    <Button onClick={() => setPending({ report, action: "resolved" })} size="sm" variant="secondary">
                      {t("reports.resolve")}
                    </Button>
                    <Button onClick={() => setPending({ report, action: "dismissed" })} size="sm" variant="secondary">
                      {t("reports.dismiss")}
                    </Button>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <Button
                      onClick={() =>
                        void (report.status === "archived" ? restore(report) : reopen(report))
                      }
                      size="sm"
                      variant="secondary"
                    >
                      {report.status === "archived"
                        ? t("reports.restore")
                        : t("reports.reopen")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog
        footer={
          <>
            <Button onClick={() => setPending(null)} size="sm" variant="secondary">
              {t("common.cancel")}
            </Button>
            <Button loading={busy} onClick={() => void confirm()} size="sm">
              {t("reports.confirm")}
            </Button>
          </>
        }
        onClose={() => setPending(null)}
        open={pending !== null}
        title={t("reports.confirmTitle")}
      >
        <p>
          {pending?.action === "archive"
            ? t("reports.confirmArchiveText")
            : pending?.action === "dismissed"
              ? t("reports.confirmDismissText")
              : t("reports.confirmResolveText")}
        </p>
      </Dialog>
    </main>
  );
}
