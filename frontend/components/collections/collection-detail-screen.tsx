"use client";

import { useEffect, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { RemoveFromCollection } from "@/components/remove-from-collection";
import { AppLink } from "@/lib/navigation";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { CollectionDetail } from "@/lib/types";

import styles from "./collection-detail-screen.module.css";

export function CollectionDetailScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.collections.detail(id).then(setData).catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <main>
        <Card title={t("collections.loadError")}>
          <AppLink href="/collections">← {t("collections.title")}</AppLink>
        </Card>
      </main>
    );
  }

  if (!data) return <main><p>Загрузка…</p></main>;

  return (
    <main>
      <AppLink className={styles.back} href="/collections">← {t("collections.title")}</AppLink>
      <PageHeader title={data.collection.title} />
      {data.items.length === 0 ? (
        <p className={styles.empty}>{t("collections.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {data.items.map((item) => (
            <li key={item.id}>
              <ItemCard
                footer={<RemoveFromCollection collectionId={id} itemId={item.id} />}
                href={`/items/${item.id}`}
                item={item}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
