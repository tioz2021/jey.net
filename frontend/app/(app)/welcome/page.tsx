import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NicknameForm } from "@/components/forms/nickname-form";
import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { UserResponse } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return {
    title: `${translate(locale, "auth.welcomeTitle")} — jey.net`,
    robots: { index: false, follow: false },
  };
}

export default async function WelcomePage() {
  const locale = await getServerLocale();
  const response = await backendFetch("/me");

  if (!response.ok) {
    redirect("/login");
  }

  const { user } = (await response.json()) as UserResponse;

  return (
    <main>
      <PageHeader
        subtitle={translate(locale, "auth.welcomeSubtitle")}
        title={translate(locale, "auth.welcomeTitle")}
      />
      <Card>
        <p className={styles.step}>{translate(locale, "auth.welcomeStep")}</p>
        <NicknameForm initial={user.display_name} />
      </Card>
    </main>
  );
}
