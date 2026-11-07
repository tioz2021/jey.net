"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { PageHeader, Card } from "@/components/ui";
import { api } from "@/lib/api";
import type { CollectionDetail } from "@/lib/types";

import styles from "./collection-detail-client.module.css";

export function CollectionDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.collections
      .detail(id)
      .then(setData)
      .catch(() => setError("Не удалось открыть коллекцию"));
  }, [id]);

  if (error) {
    return (
      <main className={styles.page}>
        <Card title="Коллекция">
          <p>{error}</p>
          <Link href="/collections">← К коллекциям</Link>
        </Card>
      </main>
    );
  }

  if (!data) {
    return <main className={styles.page}><p>Загрузка…</p></main>;
  }

  return (
    <main className={styles.page}>
      <Link href="/collections">← Коллекции</Link>
      <PageHeader title={data.collection.title} />
      {data.items.length === 0 ? (
        <p className={styles.empty}>В коллекции пока нет записей.</p>
      ) : (
        <ul className={styles.list}>
          {data.items.map((item) => (
            <li key={item.id}>
              <ItemCard href={`/items/${item.id}`} item={item} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
