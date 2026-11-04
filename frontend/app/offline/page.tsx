import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageHeader } from "@/components/ui";
import { getServerLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Нет соединения — jey.net",
};

export default async function OfflinePage() {
  const locale = await getServerLocale();

  return (
    <main>
      <PageHeader title={translate(locale, "offline.title")} />
      <Card>
        <p style={{ margin: 0 }}>{translate(locale, "offline.text")}</p>
        <p style={{ marginBottom: 0 }}>
          <Link href="/items">{translate(locale, "offline.action")}</Link>
        </p>
      </Card>
    </main>
  );
}
