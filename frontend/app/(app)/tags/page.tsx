import type { Metadata } from "next";
import Link from "next/link";

import { DeleteTagButton } from "@/components/items/delete-tag-button";
import { EmptyState } from "@/components/empty-state";
import { Card, PageHeader } from "@/components/ui";
import { backendFetch } from "@/lib/server-api";
import type { TagsResponse } from "@/lib/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Теги — jey.net",
};

export default async function TagsPage() {
  const response = await backendFetch("/tags");

  if (!response.ok) {
    return (
      <main>
        <Card title="Не удалось загрузить теги">
          <p className={styles.muted}>Попробуйте обновить страницу позже.</p>
          <p>
            <Link href="/items">← К записям</Link>
          </p>
        </Card>
      </main>
    );
  }

  const { tags } = (await response.json()) as TagsResponse;

  return (
    <main>
      <PageHeader
        subtitle={
          tags.length === 0
            ? "Теги появятся, когда вы добавите их к записям"
            : `Всего тегов: ${tags.length}`
        }
        title="Теги"
      />

      {tags.length === 0 ? (
        <EmptyState
          title="Тегов пока нет"
          text="Добавьте теги в форме записи — они появятся здесь."
          actionHref="/items/new"
          actionLabel="Добавить запись"
        />
      ) : (
        <Card>
          <ul className={styles.list}>
          {tags.map((tag) => (
            <li key={tag.id} className={styles.row}>
              <Link
                className={styles.name}
                href={`/items?tag=${encodeURIComponent(tag.name)}`}
              >
                {tag.name}
              </Link>
              <span className={styles.count}>
                {tag.item_count}{" "}
                {plural(tag.item_count, "запись", "записи", "записей")}
              </span>
              <DeleteTagButton tagId={tag.id} name={tag.name} />
            </li>
          ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}
