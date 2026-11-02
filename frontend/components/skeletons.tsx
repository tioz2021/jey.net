import { Skeleton } from "@/components/ui";

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
  return (
    <div
      className={styles.list}
      role="status"
      aria-busy="true"
      aria-label="Загрузка записей"
    >
      {Array.from({ length: count }, (_, index) => (
        <ItemCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className={styles.dashboard}
      role="status"
      aria-busy="true"
      aria-label="Загрузка статистики"
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
  return (
    <div
      className={styles.rows}
      role="status"
      aria-busy="true"
      aria-label="Загрузка"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height="2.5rem" />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div
      className={styles.detail}
      role="status"
      aria-busy="true"
      aria-label="Загрузка записи"
    >
      <Skeleton width="60%" height="2rem" />
      <Skeleton width="30%" height="1rem" />
      <Skeleton height="6rem" />
      <Skeleton height="4rem" />
    </div>
  );
}
