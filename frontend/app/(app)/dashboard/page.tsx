import type { Metadata } from "next";
import Link from "next/link";

import { Distribution } from "@/components/stats/distribution";
import { MonthChart } from "@/components/stats/month-chart";
import { StatCard } from "@/components/stats/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Card, PageHeader } from "@/components/ui";

import { KIND_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { ItemKind, ItemStatus, Stats } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return { title: `${translate(locale, "dashboard.title")} — jey.net` };
}

export default async function DashboardPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const response = await backendFetch("/stats");

  if (!response.ok) {
    return (
      <main>
        <Card title={t("dashboard.errorTitle")}>
          <p className={styles.muted}>{t("dashboard.errorText")}</p>
          <p>
            <Link href="/items">← К записям</Link>
          </p>
        </Card>
      </main>
    );
  }

  const stats = (await response.json()) as Stats;

  if (stats.total === 0) {
    return (
      <main>
        <PageHeader title={t("dashboard.title")} />
        <div className={styles.cards}>
          <StatCard label={t("dashboard.total")} value="0" />
          <StatCard label={t("dashboard.avg")} value="—" />
          <StatCard label={t("dashboard.done")} value="0" />
          <StatCard label={t("dashboard.planned")} value="0" />
        </div>
        <EmptyState
          title={t("dashboard.emptyTitle")}
          text={t("dashboard.emptyText")}
          actionHref="/items/new"
          actionLabel={t("items.empty.noneAction")}
          variant="stats"
        />
      </main>
    );
  }

  const kindRows = (["movie", "tv", "book", "game"] as ItemKind[]).map(
    (kind) => ({
      label: t(KIND_KEYS[kind]),
      count: stats.by_kind[kind] ?? 0,
      href: `/items?kind=${kind}`,
    }),
  );

  const statusRows = (Object.keys(STATUS_KEYS) as ItemStatus[]).map(
    (status) => ({
      label: t(STATUS_KEYS[status]),
      count: stats.by_status[status] ?? 0,
      href: `/items?status=${status}`,
    }),
  );

  return (
    <main>
      <PageHeader title={t("dashboard.title")} />

      <section className={styles.cards} aria-label={t("dashboard.title")}>
        <StatCard label={t("dashboard.total")} value={String(stats.total)} />
        <StatCard
          label={t("dashboard.avg")}
          value={stats.average_rating > 0 ? stats.average_rating.toFixed(1) : "—"}
          hint={t("dashboard.avgHint")}
        />
        <StatCard
          label={t("dashboard.done")}
          value={String(stats.by_status.done ?? 0)}
        />
        <StatCard
          label={t("dashboard.planned")}
          value={String(stats.by_status.planned ?? 0)}
        />
      </section>

      <Card title={t("dashboard.byMonth")}>
        <MonthChart data={stats.by_month} />
      </Card>

      <div className={styles.grid}>
        <Card title={t("dashboard.byKind")}>
          <Distribution rows={kindRows} total={stats.total} />
        </Card>
        <Card title={t("dashboard.byStatus")}>
          <Distribution rows={statusRows} total={stats.total} />
        </Card>
      </div>
    </main>
  );
}
