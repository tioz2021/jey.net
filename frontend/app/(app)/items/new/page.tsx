import type { Metadata } from "next";
import Link from "next/link";

import { ItemForm } from "@/components/forms/item-form";
import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return { title: `${translate(locale, "page.itemNew")} — jey.net` };
}

export default async function NewItemPage() {
  const locale = await getServerLocale();

  return (
    <main>
      <p className={styles.back}>
        <Link href="/items">{translate(locale, "item.back")}</Link>
      </p>
      <PageHeader title={translate(locale, "page.itemNew")} />
      <Card>
        <ItemForm />
      </Card>
    </main>
  );
}
