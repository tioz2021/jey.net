import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemForm } from "@/components/forms/item-form";
import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { ItemResponse } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await getServerLocale();
  const response = await backendFetch(`/items/${encodeURIComponent(id)}`);
  if (response.ok) {
    const { item } = (await response.json()) as ItemResponse;
    return { title: `${item.title} — ${translate(locale, "page.itemEdit")} — jey.net` };
  }
  return { title: `${translate(locale, "page.itemEdit")} — jey.net` };
}

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  const response = await backendFetch(`/items/${encodeURIComponent(id)}`);

  if (response.status === 400 || response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    return (
      <main>
        <Card title={translate(locale, "item.loadErrorTitle")}>
          <p className={styles.muted}>
            {translate(locale, "item.loadErrorText")}
          </p>
          <p>
            <Link href="/items">{translate(locale, "item.back")}</Link>
          </p>
        </Card>
      </main>
    );
  }

  const { item } = (await response.json()) as ItemResponse;

  return (
    <main>
      <p className={styles.back}>
        <Link href={`/items/${item.id}`}>← К записи</Link>
      </p>
      <PageHeader title={translate(locale, "page.itemEdit")} />
      <Card>
        <ItemForm initial={item} itemId={item.id} />
      </Card>
    </main>
  );
}
