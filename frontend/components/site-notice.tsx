"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/lib/locale-context";
import type { SiteStatus } from "@/lib/types";

import styles from "./site-notice.module.css";

/** Global announcement and maintenance banner. */
export function SiteNotice() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function load() {
      void fetch("/api/v1/site/status", { credentials: "omit" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: SiteStatus | null) => setStatus(data))
        .catch(() => undefined);
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!status || (!status.maintenance && (!status.announcement_active || hidden))) {
    return null;
  }

  return (
    <div className={`${styles.banner} ${status.maintenance ? styles.maintenance : ""}`} role="status">
      <div className={styles.inner}>
        <strong>{status.maintenance ? t("site.maintenanceTitle") : t("site.announcementTitle")}</strong>
        <span>
          {status.maintenance
            ? t("site.maintenanceText")
            : status.announcement}
        </span>
        {!status.maintenance ? (
          <button aria-label={t("common.close")} onClick={() => setHidden(true)} type="button">✕</button>
        ) : null}
      </div>
    </div>
  );
}
