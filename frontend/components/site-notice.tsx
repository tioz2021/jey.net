"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { useI18n } from "@/lib/locale-context";
import type { SiteStatus } from "@/lib/types";

import styles from "./site-notice.module.css";

/** Global announcement and maintenance banner. */
export function SiteNotice({ initialStatus = null }: { initialStatus?: SiteStatus | null }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<SiteStatus | null>(initialStatus);
  const [hidden, setHidden] = useState(false);

  useLayoutEffect(() => {
    if (!status || !status.announcement_active) return;
    const key = String(status.announcement_version);
    setHidden(window.localStorage.getItem("jey-announcement-dismissed") === key);
  }, [status]);

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

  function dismiss() {
    if (status) {
      window.localStorage.setItem("jey-announcement-dismissed", String(status.announcement_version));
    }
    setHidden(true);
  }

  return (
    <div className={`${styles.banner} ${status.maintenance ? styles.maintenance : ""}`} role="status">
      <div className={styles.inner}>
        <strong className={styles.title}>
          {status.maintenance
            ? t("site.maintenanceTitle")
            : status.announcement_title || t("site.announcementTitle")}
        </strong>
        <p className={styles.text}>
          {status.maintenance
            ? t("site.maintenanceText")
            : status.announcement}
        </p>
        {!status.maintenance ? (
          <button aria-label={t("common.close")} className={styles.close} onClick={dismiss} type="button">✕</button>
        ) : null}
      </div>
    </div>
  );
}
