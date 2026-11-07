"use client";

import { useEffect, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { Card } from "@/components/ui";
import { AppLink } from "@/lib/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { PublicCollection } from "@/lib/types";

import styles from "./public-collection-screen.module.css";

export function PublicCollectionScreen({ id, slug }: { id: string; slug: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<PublicCollection | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.publicCollections.get(id, slug).then(setData).catch(() => setError(true));
  }, [id, slug]);

  if (error) return <main><Card title={t("collections.loadError")}><AppLink href={`/u/${id}`}>← {t("item.backProfile")}</AppLink></Card></main>;
  if (!data) return <main><p>Загрузка…</p></main>;

  return (
    <main>
      <AppLink className={styles.back} href={`/u/${id}`}>{t("item.backProfile")}</AppLink>
      <p className={styles.kicker}>{t("collections.publicKicker")}</p>
      <h1 className={styles.title}>{data.collection.title}</h1>
      <p className={styles.owner}><AppLink href={`/u/${id}`}>{t("collections.byOwner", { name: data.collection.owner_name })}</AppLink></p>
      {data.items.length === 0 ? <p className={styles.empty}>{t("collections.empty")}</p> : (
        <ul className={styles.list}>{data.items.map((item) => (
          <li key={item.id}><ItemCard href={`/u/${id}/cart/${item.slug}`} item={item} /></li>
        ))}</ul>
      )}
    </main>
  );
}
