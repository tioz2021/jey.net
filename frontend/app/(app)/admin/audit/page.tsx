import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { AdminActionsResponse } from "@/lib/types";

import styles from "./audit.module.css";

const ACTIONS = [
  "user.sessions_revoked",
  "user.suspended",
  "user.restored",
  "user.admin_granted",
  "user.admin_removed",
  "user.deleted",
  "report.reopened",
  "content.restored",
  "content.hidden",
  "report.archived",
  "report.dismissed",
  "report.resolved",
];

function humanDetails(
  row: AdminActionsResponse["actions"][number],
  t: (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => string,
) {
  const details = row.details as Record<string, unknown>;
  const onOff = (value: unknown) =>
    value ? t("admin.auditEnabled") : t("admin.auditDisabled");
  switch (row.action) {
    case "site.updated":
      return `${t("admin.siteAnnouncement")}: ${onOff(details.announcement_active)} · ${t("admin.siteMaintenance")}: ${onOff(details.maintenance)} · ${t("admin.siteRegistration")}: ${onOff(details.registration_enabled)}`;
    case "user.role_changed":
      return `${t("admin.role")}: ${String(details.role ?? "—")}`;
    case "user.sessions_revoked":
      return `${t("admin.auditSessions")}: ${String(details.revoked ?? "—")}`;
    case "user.suspended":
      return details.reason ? `${t("admin.suspend")} · ${t("admin.auditReason")}: ${String(details.reason)}` : t("admin.suspend");
    case "user.restored":
      return t("admin.restore");
    case "user.test_marked":
      return t("admin.testMark");
    case "user.test_unmarked":
      return t("admin.testUnmark");
    case "test_data.purged":
      return `${t("admin.auditDeleted")}: ${String(details.users ?? "—")}`;
    case "content.hidden":
      return t("admin.auditContentHidden");
    case "content.restored":
      return t("admin.auditContentRestored");
    case "report.reopened":
      return t("reports.reopen");
    case "report.resolved":
    case "report.dismissed":
    case "report.archived":
      return `${t("admin.auditStatus")}: ${String(details.status ?? row.action)}`;
    default:
      return Object.keys(details).length > 0 ? JSON.stringify(details) : "—";
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "admin.audit")} — jey.net` };
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action = "" } = await searchParams;
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const response = await backendFetch(
    `/admin/audit?limit=100&action=${encodeURIComponent(action)}`,
  );
  if (!response.ok) {
    return (
      <main>
        <PageHeader title={t("admin.audit")} />
        <Card><p className={styles.muted}>{t("analytics.noAccess")}</p></Card>
      </main>
    );
  }
  const data = (await response.json()) as AdminActionsResponse;
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(
      locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU",
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
    ).format(new Date(value));

  return (
    <main>
      <PageHeader subtitle={t("admin.auditSubtitle")} title={t("admin.audit")} />
      <form className={styles.filter} method="get">
        <label htmlFor="audit-action">{t("admin.action")}</label>
        <select defaultValue={action} id="audit-action" name="action">
          <option value="">{t("admin.allActions")}</option>
          {ACTIONS.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <button type="submit">{t("admin.apply")}</button>
      </form>
      <Card title={t("admin.audit")}>
        {data.actions.length === 0 ? (
          <p className={styles.muted}>{t("admin.auditEmpty")}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("admin.when")}</th>
                  <th>{t("admin.admin")}</th>
                  <th>{t("admin.action")}</th>
                  <th>{t("admin.target")}</th>
                  <th>{t("admin.details")}</th>
                  <th>JSON</th>
                </tr>
              </thead>
              <tbody>
                {data.actions.map((row) => (
                  <tr key={row.id}>
                    <td>{dateTime(row.created_at)}</td>
                    <td>{row.admin_name}</td>
                    <td><code>{row.action}</code></td>
                    <td>
                      {row.target_label ?? row.target_id ?? row.target_type}
                      <small>{row.target_type}</small>
                    </td>
                    <td><span>{humanDetails(row, t)}</span></td>
                    <td><code className={styles.json}>{JSON.stringify(row.details)}</code></td>
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
