import type { Metadata } from "next";
import Link from "next/link";

import { ExportPanel } from "@/components/export-panel";
import { SettingsForm } from "@/components/forms/settings-form";
import { Card } from "@/components/ui";
import { backendFetch } from "@/lib/server-api";
import type { UserResponse } from "@/lib/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Настройки — jey",
};

export default async function SettingsPage() {
  const response = await backendFetch("/me");

  if (!response.ok) {
    return (
      <main>
        <Card title="Не удалось загрузить настройки">
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
      <h1 className={styles.title}>Настройки</h1>
      <SettingsForm initialUser={user} />
      <ExportPanel />
    </main>
  );
}
