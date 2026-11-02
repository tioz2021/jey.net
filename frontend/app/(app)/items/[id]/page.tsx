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
  title: "Запись — jey.net",
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
            <h1 className={styles.title}>
              {item.title}
              {item.year ? <span className={styles.year}> ({item.year})</span> : null}
            </h1>
            {item.subtitle ? (
              <p className={styles.subtitle}>{item.subtitle}</p>
            ) : null}
          </div>
          <ItemActions itemId={item.id} title={item.title} />
        </header>

        <div className={styles.body}>
          <div className={styles.poster}>
            {item.cover_key ? (
              // Covers are ready-made WebP renditions served by our API.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/media/${item.cover_key}`}
                alt={`Обложка записи «${item.title}»`}
              />
            ) : (
              <div className={styles.posterPlaceholder}>Нет обложки</div>
            )}
          </div>

          <dl className={styles.meta}>
            <div className={styles.metaRow}>
              <dt>Тип</dt>
              <dd>
                <Badge>{KIND_LABELS[item.kind]}</Badge>
              </dd>
            </div>

            <div className={styles.metaRow}>
              <dt>Статус</dt>
              <dd>
                <Badge tone={STATUS_TONES[item.status]}>
                  {STATUS_LABELS[item.status]}
                </Badge>
              </dd>
            </div>

            <div className={styles.metaRow}>
              <dt>Оценка</dt>
              <dd>{item.rating ? `${item.rating} из 10` : "—"}</dd>
            </div>

            <div className={styles.metaRow}>
              <dt>Год</dt>
              <dd>{item.year ?? "—"}</dd>
            </div>

            <div className={styles.metaRow}>
              <dt>Ссылка</dt>
              <dd>
                {item.source_url ? (
                  <a
                    href={item.source_url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {item.source_url}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>

            <div className={styles.metaRow}>
              <dt>Теги</dt>
              <dd>
                {item.tags.length > 0 ? (
                  <ul className={styles.tags}>
                    {item.tags.map((tag) => (
                      <li key={tag}>
                        <Badge>{tag}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
            </div>

            <div className={styles.metaRow}>
              <dt>Добавлено</dt>
              <dd>{formatDate(item.created_at)}</dd>
            </div>

            <div className={styles.metaRow}>
              <dt>Изменено</dt>
              <dd>{formatDate(item.updated_at)}</dd>
            </div>

            {item.deleted_at ? (
              <div className={styles.metaRow}>
                <dt>В корзине</dt>
                <dd>{formatDate(item.deleted_at)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {item.review ? (
          <section className={styles.reviewBlock}>
            <h2 className={styles.sectionTitle}>Заметка</h2>
            <p className={styles.review}>{item.review}</p>
          </section>
        ) : null}
      </article>
    </main>
  );
}
