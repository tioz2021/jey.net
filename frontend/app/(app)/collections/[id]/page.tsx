import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemCard } from "@/components/items/item-card";
import { RemoveFromCollection } from "@/components/remove-from-collection";
import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { CollectionDetail } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await getServerLocale();
  const response = await backendFetch(`/collections/${encodeURIComponent(id)}`);
  if (response.ok) {
    const data = (await response.json()) as CollectionDetail;
    return { title: `${data.collection.title} — jey.net` };
  }
  return { title: `${translate(locale, "collections.title")} — jey.net` };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  const response = await backendFetch(`/collections/${encodeURIComponent(id)}`);
  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <main>
        <Card title={translate(locale, "collections.loadError")}>
          <Link href="/collections">← {translate(locale, "collections.title")}</Link>
        </Card>
      </main>
    );
  }
  const data = (await response.json()) as CollectionDetail;

  return (
    <main>
      <Link className={styles.back} href="/collections">
        ← {translate(locale, "collections.title")}
      </Link>
      <PageHeader
        action={
          data.collection.visibility === "public" && data.collection.handle ? (
            <Link href={`/u/${data.collection.handle}/collection/${data.collection.slug}`}>
              {translate(locale, "collections.openPublic")}
            </Link>
          ) : null
        }
        title={data.collection.title}
      />
      {data.items.length === 0 ? (
        <p className={styles.empty}>{translate(locale, "collections.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {data.items.map((item) => (
            <li className={styles.item} key={item.id}>
              <ItemCard item={item} />
              <RemoveFromCollection collectionId={id} itemId={item.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
