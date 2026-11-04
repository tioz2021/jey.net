import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { STATUS_KEYS } from "@/lib/i18n/labels";
import { translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { ItemStatus, UserResponse } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return {
    title: `${translate(locale, "auth.privacyTitle")} — jey.net`,
    robots: { index: false, follow: false },
  };
}

export default async function PrivacyWelcomePage() {
  const locale = await getServerLocale();
  const response = await backendFetch("/me");
  if (!response.ok) redirect("/login");
  const { user } = (await response.json()) as UserResponse;
  const statuses = (user.public_statuses ?? ["done"])
    .filter((status): status is ItemStatus => status in STATUS_KEYS)
    .map((status) => translate(locale as Locale, STATUS_KEYS[status]))
    .join(", ");

  return (
    <main>
      <PageHeader
        subtitle={translate(locale, "auth.privacySubtitle")}
        title={translate(locale, "auth.privacyTitle")}
      />
      <Card>
        <p className={styles.step}>{translate(locale, "auth.privacyStep")}</p>
        <p>{translate(locale, "auth.privacyBody")}</p>
        <div className={styles.summary}>
          <p>
            <strong>{translate(locale, "auth.privacyStatuses")}</strong>{" "}
            {statuses || translate(locale, "auth.privacyNone")}
          </p>
          <p>{translate(locale, "auth.privacyNotes")}</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/items">
            {translate(locale, "auth.privacyContinue")}
          </Link>
          <Link className={styles.secondary} href="/settings#privacy">
            {translate(locale, "auth.privacySettings")}
          </Link>
        </div>
      </Card>
    </main>
  );
}
