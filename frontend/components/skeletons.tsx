"use client";

import { Skeleton } from "@/components/ui";

import { useI18n } from "@/lib/locale-context";

import styles from "./skeletons.module.css";

export function ItemCardSkeleton() {
  return (
    <div className={styles.card}>
      <div className={styles.poster}>
        <Skeleton height="100%" />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <Skeleton width="58%" height="1.4rem" />
          <Skeleton width="4.5rem" height="1.4rem" />
        </div>
        <Skeleton width="42%" height="0.9rem" />
        <Skeleton width="28%" height="0.8rem" />
        <Skeleton width="72%" height="0.9rem" />
        <Skeleton height="2.5rem" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <div
      aria-busy="true"
      aria-label={t("skeleton.records")}
      className={styles.list}
      role="status"
    >
      {Array.from({ length: count }, (_, index) => (
        <ItemCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <Skeleton width="11rem" height="1.8rem" />
        <Skeleton width="16rem" height="0.9rem" />
      </div>
      <Skeleton width="8rem" height="2rem" />
    </div>
  );
}

export function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <div
      aria-busy="true"
      aria-label={t("skeleton.stats")}
      className={styles.dashboard}
      role="status"
    >
      <div className={styles.cards}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton height="5rem" key={index} />
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
      aria-busy="true"
      aria-label={t("skeleton.generic")}
      className={styles.rows}
      role="status"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton height="2.5rem" key={index} />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  const { t } = useI18n();
  return (
    <div
      aria-busy="true"
      aria-label={t("skeleton.item")}
      className={styles.detail}
      role="status"
    >
      <Skeleton width="8rem" height="0.9rem" />
      <PageHeaderSkeleton />
      <div className={styles.detailGrid}>
        <div className={styles.detailPoster}>
          <Skeleton height="100%" />
        </div>
        <div className={styles.detailBody}>
          <Skeleton width="35%" height="0.9rem" />
          <Skeleton width="80%" height="0.9rem" />
          <Skeleton width="55%" height="0.9rem" />
          <Skeleton width="65%" height="0.9rem" />
          <Skeleton width="45%" height="0.9rem" />
          <Skeleton height="5rem" />
        </div>
      </div>
      <Skeleton height="9rem" />
      <Skeleton height="7rem" />
    </div>
  );
}

export function PublicProfileSkeleton() {
  const { t } = useI18n();
  return (
    <div
      aria-busy="true"
      aria-label={t("skeleton.profile")}
      className={styles.profile}
      role="status"
    >
      <Skeleton height="116px" />
      <div className={styles.profileIdentity}>
        <div className={styles.profileAvatar}>
          <Skeleton height="100%" />
        </div>
        <div className={styles.profileText}>
          <Skeleton width="12rem" height="2rem" />
          <Skeleton width="18rem" height="0.9rem" />
          <Skeleton width="14rem" height="1.4rem" />
        </div>
      </div>
      <Skeleton height="2.5rem" />
      <ListSkeleton count={2} />
    </div>
  );
}

export function SettingsSkeleton() {
  const { t } = useI18n();
  return (
    <div
      aria-busy="true"
      aria-label={t("skeleton.generic")}
      className={styles.settings}
      role="status"
    >
      <div className={styles.settingsCard}>
        <Skeleton width="9rem" height="1.4rem" />
        <Skeleton height="9rem" />
      </div>
      <div className={styles.settingsCard}>
        <Skeleton width="10rem" height="1.4rem" />
        <Skeleton height="4rem" />
        <Skeleton height="4rem" />
      </div>
    </div>
  );
}
