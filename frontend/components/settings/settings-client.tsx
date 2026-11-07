"use client";

import { useEffect, useState } from "react";

import { BlockedProfiles } from "@/components/blocked-profiles";
import { ExportPanel } from "@/components/export-panel";
import { SettingsForm } from "@/components/forms/settings-form";
import { NotificationSettings } from "@/components/notification-settings";
import { PushSettings } from "@/components/push-settings";
import { ShareProfile } from "@/components/share-profile";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { User } from "@/lib/types";

import styles from "@/app/(app)/settings/page.module.css";

/** Client-owned settings screen; the profile is fetched once on mount. */
export function SettingsClient() {
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.auth
      .me()
      .then((response) => setUser(response.user))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <main>
        <Card title={t("settings.errorTitle")}>
          <p>Не удалось загрузить настройки</p>
        </Card>
      </main>
    );
  }

  if (!user) {
    return (
      <main>
        <Card title={t("settings.title")}>
          <p>Загрузка…</p>
        </Card>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t("settings.title")} />
      <div className={styles.stack}>
        <SettingsForm initialUser={user} />
        <NotificationSettings />
        <PushSettings />
        <BlockedProfiles />
        <ShareProfile />
        <ExportPanel />
      </div>
    </main>
  );
}
