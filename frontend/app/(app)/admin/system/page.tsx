import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { SystemStatus } from "@/lib/types";

import styles from "./system.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "admin.system")} — jey.net` };
}

function percent(used: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
}

function bytes(value: number) {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

export default async function AdminSystemPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const response = await backendFetch("/admin/system");
  if (!response.ok) {
    return (
      <main>
        <PageHeader title={t("admin.system")} />
        <Card><p className={styles.muted}>{t("analytics.noAccess")}</p></Card>
      </main>
    );
  }
  const data = (await response.json()) as SystemStatus;
  const dateTime = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(
          locale === "uk" ? "uk-UA" : locale === "en" ? "en-US" : "ru-RU",
          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
        ).format(new Date(value))
      : "—";
  const services = [
    ["api", data.services.api],
    ["web", data.services.web],
    ["caddy", data.services.caddy],
    ["postgres", data.services.postgres],
  ] as const;
  const serviceLabel = (value: string) =>
    value === "ok" ? t("admin.ok") : value === "down" ? t("admin.down") : t("admin.unknown");

  return (
    <main>
      <PageHeader subtitle={t("admin.systemSubtitle")} title={t("admin.system")} />
      <section className={styles.services}>
        {services.map(([name, value]) => (
          <div className={styles.service} key={name}>
            <span className={`${styles.dot} ${value === "ok" ? styles.good : styles.bad}`} />
            <strong>{name}</strong>
            <span>{serviceLabel(value)}</span>
          </div>
        ))}
      </section>

      <div className={styles.two}>
        <Card title={t("admin.disk")}>
          <div className={styles.meter}>
            <div style={{ width: `${percent(data.disk.used, data.disk.total)}%` }} />
          </div>
          <p>{bytes(data.disk.used)} / {bytes(data.disk.total)} · {percent(data.disk.used, data.disk.total)}%</p>
        </Card>
        <Card title={t("admin.memory")}>
          <div className={styles.meter}>
            <div style={{ width: `${percent(data.memory.total - data.memory.available, data.memory.total)}%` }} />
          </div>
          <p>
            {bytes(data.memory.total - data.memory.available)} / {bytes(data.memory.total)}
          </p>
        </Card>
      </div>

      <Card title={t("admin.deployment")}>
        <dl className={styles.facts}>
          <dt>{t("admin.version")}</dt><dd>{data.version}</dd>
          <dt>{t("admin.lastDeploy")}</dt><dd>{dateTime(data.last_deploy_at)}</dd>
          <dt>{t("admin.migrations")}</dt><dd>{data.migrations.count} · {data.migrations.latest ?? "—"}</dd>
          <dt>{t("admin.errors24")}</dt><dd>{data.errors_24h}</dd>
        </dl>
      </Card>

      <Card title={t("admin.backup")}>
        {data.backup.missing || !data.backup.ok ? (
          <p className={styles.warn}>{t("admin.backupMissing")}</p>
        ) : (
          <dl className={styles.facts}>
            <dt>{t("admin.backupLast")}</dt><dd>{dateTime(data.backup.finished_at)}</dd>
            <dt>{t("admin.backupFile")}</dt><dd><code>{data.backup.file}</code></dd>
            <dt>{t("admin.backupSize")}</dt><dd>{bytes(data.backup.bytes ?? 0)}</dd>
            <dt>{t("admin.backupSha")}</dt><dd><code>{data.backup.sha256}</code></dd>
          </dl>
        )}
      </Card>
    </main>
  );
}
