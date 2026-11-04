import type { Metadata } from "next";
import Link from "next/link";

import { BlockedProfiles } from "@/components/blocked-profiles";
import { ExportPanel } from "@/components/export-panel";
import { ShareProfile } from "@/components/share-profile";
import { SettingsForm } from "@/components/forms/settings-form";
import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { UserResponse } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return { title: `${translate(locale, "settings.title")} — jey.net` };
}

export default async function SettingsPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const response = await backendFetch("/me");

  if (!response.ok) {
    return (
      <main>
        <Card title={t("settings.errorTitle")}>
          <p>
            <Link href="/items">← К записям</Link>
          </p>
        </Card>
      </main>
    );
  }

  const { user } = (await response.json()) as UserResponse;

  return (
    <main>
      <PageHeader title={t("settings.title")} />
      <div className={styles.stack}>
        <SettingsForm initialUser={user} />
        <BlockedProfiles />
        <ShareProfile />
        <ExportPanel />
      </div>
    </main>
  );
}
