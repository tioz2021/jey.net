import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemForm } from "@/components/forms/item-form";
import { Card } from "@/components/ui";
import { backendFetch } from "@/lib/server-api";
import type { ItemResponse } from "@/lib/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Редактирование — jey",
};

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await backendFetch(`/items/${encodeURIComponent(id)}`);

  if (response.status === 400 || response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    return (
      <main>
        <Card title="Не удалось загрузить запись">
          <p className={styles.muted}>Попробуйте обновить страницу позже.</p>
          <p>
            <Link href="/items">← К записям</Link>
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
      <h1 className={styles.title}>Редактирование</h1>
      <ItemForm initial={item} itemId={item.id} />
    </main>
  );
}
