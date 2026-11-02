import type { Metadata } from "next";
import Link from "next/link";

import { Distribution } from "@/components/stats/distribution";
import { MonthChart } from "@/components/stats/month-chart";
import { StatCard } from "@/components/stats/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Card, PageHeader } from "@/components/ui";
import { KIND_LABELS, STATUS_LABELS } from "@/lib/labels";
import { backendFetch } from "@/lib/server-api";
import type { ItemKind, ItemStatus, Stats } from "@/lib/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Статистика — jey.net",
};

export default async function DashboardPage() {
  const response = await backendFetch("/stats");

  if (!response.ok) {
    return (
      <main>
        <Card title="Не удалось загрузить статистику">
          <p className={styles.muted}>Попробуйте обновить страницу позже.</p>
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
        <PageHeader title="Статистика" />
        <div className={styles.cards}>
          <StatCard label="Всего записей" value="0" />
          <StatCard label="Средняя оценка" value="—" />
          <StatCard label="Готово" value="0" />
          <StatCard label="Запланировано" value="0" />
        </div>
        <EmptyState
          title="Пока нечего считать"
          text="Добавьте первую запись — здесь появятся графики по месяцам, типам и статусам."
          actionHref="/items/new"
          actionLabel="Добавить запись"
        />
      </main>
    );
  }

  const kindRows = (Object.keys(KIND_LABELS) as ItemKind[]).map((kind) => ({
    label: KIND_LABELS[kind],
    count: stats.by_kind[kind] ?? 0,
  }));

  const statusRows = (Object.keys(STATUS_LABELS) as ItemStatus[]).map(
    (status) => ({
      label: STATUS_LABELS[status],
      count: stats.by_status[status] ?? 0,
    }),
  );

  return (
    <main>
      <PageHeader title="Статистика" />

      <section className={styles.cards} aria-label="Итоги">
        <StatCard label="Всего записей" value={String(stats.total)} />
        <StatCard
          label="Средняя оценка"
          value={stats.average_rating > 0 ? stats.average_rating.toFixed(1) : "—"}
          hint="по записям с оценкой"
        />
        <StatCard label="Готово" value={String(stats.by_status.done ?? 0)} />
        <StatCard
          label="Запланировано"
          value={String(stats.by_status.planned ?? 0)}
        />
      </section>

      <Card title="Добавлено по месяцам">
        <MonthChart data={stats.by_month} />
      </Card>

      <div className={styles.grid}>
        <Card>
          <Distribution title="По типам" rows={kindRows} total={stats.total} />
        </Card>
        <Card>
          <Distribution
            title="По статусам"
            rows={statusRows}
            total={stats.total}
          />
        </Card>
      </div>
    </main>
  );
}
