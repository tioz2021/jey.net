"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { NotificationPreferences } from "@/lib/types";

import styles from "./notification-settings.module.css";

const ROWS: Array<{
  key: keyof NotificationPreferences;
  label: "follow" | "item" | "comment" | "reaction";
}> = [
  { key: "follow", label: "follow" },
  { key: "item", label: "item" },
  { key: "comment", label: "comment" },
  { key: "reaction", label: "reaction" },
];

export function NotificationSettings() {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.notifications
      .settings()
      .then((response) => {
        if (!cancelled) setPrefs(response.preferences);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof NotificationPreferences) {
    if (!prefs || busy) return;
    setBusy(key);
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const response = await api.notifications.updateSettings({ [key]: next[key] });
      setPrefs(response.preferences);
    } catch {
      setPrefs(prefs);
    } finally {
      setBusy(null);
    }
  }

  if (!prefs) return null;

  return (
    <Card title={t("settings.notificationsTitle")}>
      <p className={styles.hint}>{t("settings.notificationsHint")}</p>
      <ul className={styles.list}>
        {ROWS.map(({ key, label }) => (
          <li className={styles.row} key={key}>
            <label className={styles.label}>
              <input
                checked={prefs[key]}
                disabled={busy !== null}
                onChange={() => void toggle(key)}
                type="checkbox"
              />
              <span>{t(`settings.notification.${label}`)}</span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}
