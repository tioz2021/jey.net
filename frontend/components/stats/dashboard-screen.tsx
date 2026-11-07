"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Distribution } from "@/components/stats/distribution";
import { MonthChart } from "@/components/stats/month-chart";
import { StatCard } from "@/components/stats/stat-card";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { KIND_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import type { ItemKind, ItemStatus, Stats } from "@/lib/types";

import styles from "./dashboard-screen.module.css";
import { LoadingScreen } from "@/components/loading-screen";

export function DashboardScreen() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.stats.get().then(setStats).catch(() => setError(true));
  }, []);

  if (error) return <main><Card title={t("dashboard.errorTitle")}><p className={styles.muted}>{t("dashboard.errorText")}</p></Card></main>;
  if (!stats) return <main><LoadingScreen /></main>;

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
        <EmptyState actionHref="/items/new" actionLabel={t("items.empty.noneAction")} text={t("dashboard.emptyText")} title={t("dashboard.emptyTitle")} variant="stats" />
      </main>
    );
  }

  const kindRows = (["movie", "tv", "book", "game", "anime"] as ItemKind[]).map((kind) => ({
    label: t(KIND_KEYS[kind]), count: stats.by_kind[kind] ?? 0, href: `/items?kind=${kind}`,
  }));
  const statusRows = (Object.keys(STATUS_KEYS) as ItemStatus[]).map((status) => ({
    label: t(STATUS_KEYS[status]), count: stats.by_status[status] ?? 0, href: `/items?status=${status}`,
  }));

  return (
    <main>
      <PageHeader title={t("dashboard.title")} />
      <section className={styles.cards} aria-label={t("dashboard.title")}>
        <StatCard label={t("dashboard.total")} value={String(stats.total)} />
        <StatCard label={t("dashboard.avg")} value={stats.average_rating > 0 ? stats.average_rating.toFixed(1) : "—"} hint={t("dashboard.avgHint")} />
        <StatCard label={t("dashboard.done")} value={String(stats.by_status.done ?? 0)} />
        <StatCard label={t("dashboard.planned")} value={String(stats.by_status.planned ?? 0)} />
      </section>
      <Card title={t("dashboard.byMonth")}><MonthChart data={stats.by_month} /></Card>
      <div className={styles.grid}>
        <Card title={t("dashboard.byKind")}><Distribution rows={kindRows} total={stats.total} /></Card>
        <Card title={t("dashboard.byStatus")}><Distribution rows={statusRows} total={stats.total} /></Card>
      </div>
    </main>
  );
}
