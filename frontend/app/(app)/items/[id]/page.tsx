/* eslint-disable @next/next/no-img-element -- covers are already WebP renditions served by our API */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemActions } from "@/components/items/item-actions";
import { Badge, Card } from "@/components/ui";
import { KIND_LABELS, STATUS_LABELS, STATUS_TONES } from "@/lib/labels";
import { backendFetch } from "@/lib/server-api";
import type { ItemResponse } from "@/lib/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Запись — jey",
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormat.format(new Date(value));
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await backendFetch(`/items/${encodeURIComponent(id)}`);

  // 400 means a malformed id, 404 means "no such item or not yours" — both
  // are a missing page for the visitor.
  if (response.status === 400 || response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    return (
      <main>
        <Card title="Не удалось загрузить запись">
          <p className={styles.muted}>
            Сервер ответил с ошибкой. Попробуйте обновить страницу позже.
          </p>
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
        <Link href="/items">← К записям</Link>
      </p>

      <article className={styles.article}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <h1 className={styles.title}>{item.title}</h1>
            {item.subtitle ? (
              <p className={styles.subtitle}>{item.subtitle}</p>
            ) : null}
          </div>
          <ItemActions itemId={item.id} title={item.title} />
        </header>

        {item.cover_key ? (
          <img
            className={styles.cover}
            src={`/media/${item.cover_key}`}
            alt={`Обложка записи «${item.title}»`}
          />
        ) : null}

        <div className={styles.badges}>
          <Badge>{KIND_LABELS[item.kind]}</Badge>
          <Badge tone={STATUS_TONES[item.status]}>
            {STATUS_LABELS[item.status]}
          </Badge>
          {item.year ? <Badge>{item.year}</Badge> : null}
          {item.rating ? (
            <Badge tone="accent">Оценка {item.rating} из 10</Badge>
          ) : null}
        </div>

        {item.source_url ? (
          <p className={styles.source}>
            <a href={item.source_url} rel="noreferrer noopener" target="_blank">
              {item.source_url}
            </a>
          </p>
        ) : null}

        {item.review ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Заметка</h2>
            <p className={styles.review}>{item.review}</p>
          </section>
        ) : null}

        {item.tags.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Теги</h2>
            <ul className={styles.tags}>
              {item.tags.map((tag) => (
                <li key={tag}>
                  <Badge>{tag}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className={styles.footer}>
          <span>Добавлено: {formatDate(item.created_at)}</span>
          {item.updated_at !== item.created_at ? (
            <span>Изменено: {formatDate(item.updated_at)}</span>
          ) : null}
          {item.deleted_at ? (
            <span className={styles.deleted}>
              В корзине с {formatDate(item.deleted_at)}
            </span>
          ) : null}
        </footer>
      </article>
    </main>
  );
}
