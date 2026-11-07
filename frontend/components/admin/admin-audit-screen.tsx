"use client";

import { useEffect, useState } from "react";

import { Card, PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { AdminActionsResponse } from "@/lib/types";

import styles from "./admin-audit.module.css";

const ACTIONS = [
  "user.sessions_revoked", "user.suspended", "user.restored", "user.admin_granted",
  "user.admin_removed", "user.deleted", "report.reopened", "content.restored",
  "content.hidden", "report.archived", "report.dismissed", "report.resolved",
];

function humanDetails(row: AdminActionsResponse["actions"][number], t: (key: Parameters<typeof import("@/lib/i18n").translate>[1], values?: Record<string, string | number>) => string) {
  const details = row.details as Record<string, unknown>;
  const onOff = (value: unknown) => value ? t("admin.auditEnabled") : t("admin.auditDisabled");
  switch (row.action) {
    case "site.updated": return `${t("admin.siteAnnouncement")}: ${onOff(details.announcement_active)} · ${t("admin.siteMaintenance")}: ${onOff(details.maintenance)} · ${t("admin.siteRegistration")}: ${onOff(details.registration_enabled)}`;
    case "user.role_changed": return `${t("admin.role")}: ${String(details.role ?? "—")}`;
    case "user.sessions_revoked": return `${t("admin.auditSessions")}: ${String(details.revoked ?? "—")}`;
    case "user.suspended": return details.reason ? `${t("admin.suspend")} · ${t("admin.auditReason")}: ${String(details.reason)}` : t("admin.suspend");
    case "user.restored": return t("admin.restore");
    case "user.test_marked": return t("admin.testMark");
    case "user.test_unmarked": return t("admin.testUnmark");
    case "test_data.purged": return `${t("admin.auditDeleted")}: ${String(details.users ?? "—")}`;
    case "content.hidden": return t("admin.auditContentHidden");
    case "content.restored": return t("admin.auditContentRestored");
    case "report.reopened": return t("reports.reopen");
    case "report.resolved": case "report.dismissed": case "report.archived": return `${t("admin.auditStatus")}: ${String(details.status ?? row.action)}`;
    default: return Object.keys(details).length > 0 ? JSON.stringify(details) : "—";
  }
}

export function AdminAuditScreen() {
  const { t, locale } = useI18n();
  const [action, setAction] = useState("");
  const [data, setData] = useState<AdminActionsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    fetch(`/api/v1/admin/audit?limit=100&action=${encodeURIComponent(action)}`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setData).catch(() => setError(true));
  }, [action]);

  if (error) return <main><PageHeader title={t("admin.audit")} /><Card><p>Нет доступа</p></Card></main>;
  if (!data) return <main><p>Загрузка…</p></main>;

  const dateTime = (value: string) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

  return (
    <main>
      <PageHeader subtitle={t("admin.auditSubtitle")} title={t("admin.audit")} />
      <div className={styles.filter}>
        <label htmlFor="audit-action">{t("admin.action")}</label>
        <select id="audit-action" value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="">{t("admin.allActions")}</option>
          {ACTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <Card title={t("admin.audit")}>
        {data.actions.length === 0 ? <p className={styles.muted}>{t("admin.auditEmpty")}</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead><tr><th>{t("admin.when")}</th><th>{t("admin.admin")}</th><th>{t("admin.action")}</th><th>{t("admin.target")}</th><th>{t("admin.details")}</th><th>JSON</th></tr></thead>
              <tbody>{data.actions.map((row) => (
                <tr key={row.id}><td>{dateTime(row.created_at)}</td><td>{row.admin_name}</td><td><code>{row.action}</code></td><td>{row.target_label ?? row.target_id ?? row.target_type}<small>{row.target_type}</small></td><td><span>{humanDetails(row, t)}</span></td><td><code className={styles.json}>{JSON.stringify(row.details)}</code></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
