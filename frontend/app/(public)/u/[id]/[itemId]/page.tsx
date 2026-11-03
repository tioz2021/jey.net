import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MovieInfo } from "@/components/items/movie-info";
import { Badge, Card, PageHeader } from "@/components/ui";
import { KIND_LABELS } from "@/lib/labels";
import { getPublicItem } from "@/lib/public-profile";

import styles from "./page.module.css";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}): Promise<Metadata> {
  const { id, itemId } = await params;
  const item = await getPublicItem(id, itemId);

  if (!item) {
    return { title: "Запись не найдена — jey.net", robots: { index: false } };
  }

  const description = [item.subtitle, item.year, KIND_LABELS[item.kind]]
    .filter(Boolean)
    .join(" · ");

  return {
    title: `${item.title} — jey.net`,
    description,
    alternates: { canonical: `/u/${id}/${itemId}` },
    openGraph: {
      type: "article",
      title: item.title,
      description,
      url: `/u/${id}/${itemId}`,
      images: item.cover_key ? [`/media/${item.cover_key}`] : undefined,
    },
  };
}

export default async function PublicItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const item = await getPublicItem(id, itemId);

  if (!item) {
    notFound();
  }

  return (
    <article className={styles.article}>
      <p className={styles.back}>
        <Link href={`/u/${id}`}>← К профилю</Link>
      </p>

      <PageHeader
        subtitle={item.subtitle ?? undefined}
        title={
          <>
            {item.title}
            {item.year ? <span className={styles.year}> ({item.year})</span> : null}
          </>
        }
      />

      <div className={styles.stack}>
      <div className={styles.body}>
        <div className={styles.poster}>
          {item.cover_key ? (
            // eslint-disable-next-line @next/next/no-img-element -- WebP rendition
            <img
              src={`/media/${item.cover_key}`}
              alt={`Обложка записи «${item.title}»`}
            />
          ) : (
            <div className={styles.posterPlaceholder}>Нет обложки</div>
          )}
        </div>

        <Card title="Свойства">
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
                <Badge tone="success">Готово</Badge>
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
              <dt>Обновлено</dt>
              <dd>{dateFormat.format(new Date(item.updated_at))}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {item.details ? (
        <MovieInfo
          details={item.details}
          tmdbId={item.external_source === "tmdb" ? item.external_id : null}
        />
      ) : null}

      {item.review ? (
        <Card title="Заметка">
          <p className={styles.review}>{item.review}</p>
        </Card>
      ) : null}
      </div>
    </article>
  );
}
