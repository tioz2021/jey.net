"use client";

import { Skeleton } from "@/components/ui";

import { useI18n } from "@/lib/locale-context";

import styles from "./skeletons.module.css";

export function ItemCardSkeleton() {
  return (
    <div className={styles.card}>
      <Skeleton width="55%" height="1.25rem" />
      <Skeleton width="35%" height="0.875rem" />
      <Skeleton width="100%" height="2.5rem" />
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <div
      className={styles.list}
      role="status"
      aria-busy="true"
      aria-label={t("skeleton.records")}
    >
      {Array.from({ length: count }, (_, index) => (
        <ItemCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <div
      className={styles.dashboard}
      role="status"
      aria-busy="true"
      aria-label={t("skeleton.stats")}
    >
      <div className={styles.cards}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height="5rem" />
        ))}
      </div>
      <Skeleton height="12rem" />
      <Skeleton height="8rem" />
    </div>
  );
}

export function RowsSkeleton({ count = 5 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <div
      className={styles.rows}
      role="status"
      aria-busy="true"
      aria-label={t("skeleton.generic")}
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height="2.5rem" />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  const { t } = useI18n();
  return (
    <div
      className={styles.detail}
      role="status"
      aria-busy="true"
      aria-label={t("skeleton.item")}
    >
      <Skeleton width="60%" height="2rem" />
      <Skeleton width="30%" height="1rem" />
      <Skeleton height="6rem" />
      <Skeleton height="4rem" />
    </div>
  );
}
