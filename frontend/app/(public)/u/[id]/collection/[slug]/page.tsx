import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemCard } from "@/components/items/item-card";
import { Card } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { PublicCollection } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}): Promise<Metadata> {
  const { id, slug } = await params;
  const locale = await getServerLocale();
  const response = await backendFetch(
    `/public/users/${encodeURIComponent(id)}/collections/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  if (response.ok) {
    const data = (await response.json()) as PublicCollection;
    return { title: `${data.collection.title} — jey.net` };
  }
  return { title: `${translate(locale, "collections.title")} — jey.net` };
}

export default async function PublicCollectionPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const locale = await getServerLocale();
  const response = await backendFetch(
    `/public/users/${encodeURIComponent(id)}/collections/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) notFound();
  if (!response.ok) {
    return (
      <main>
        <Card title={translate(locale, "collections.loadError")}>
          <Link href={`/u/${id}`}>← {translate(locale, "item.backProfile")}</Link>
        </Card>
      </main>
    );
  }
  const data = (await response.json()) as PublicCollection;

  return (
    <main>
      <p className={styles.kicker}>{translate(locale, "collections.publicKicker")}</p>
      <h1 className={styles.title}>{data.collection.title}</h1>
      <p className={styles.owner}>
        {translate(locale, "collections.byOwner", { name: data.collection.owner_name })}
      </p>
      {data.items.length === 0 ? (
        <p className={styles.empty}>{translate(locale, "collections.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {data.items.map((item) => (
            <li key={item.id}>
              <ItemCard
                href={`/u/${id}/cart/${item.slug}`}
                item={item}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
