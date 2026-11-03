import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemActions } from "@/components/items/item-actions";
import { MovieInfo } from "@/components/items/movie-info";
import { RefreshMovieButton } from "@/components/items/refresh-movie-button";
import { ItemNeighbors } from "@/components/items/item-neighbors";
import { Badge, Card, PageHeader } from "@/components/ui";
import { KIND_LABELS, STATUS_LABELS, STATUS_TONES } from "@/lib/labels";
import { backendFetch } from "@/lib/server-api";
import type { ItemNeighbors as ItemNeighborsResponse, ItemResponse } from "@/lib/types";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  const backHref = `/items${queryString ? `?${queryString}` : ""}`;

  const response = await backendFetch(`/items/${encodeURIComponent(id)}`);

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

  let prevHref: string | null = null;
  let nextHref: string | null = null;

  // Search results are ordered by relevance, so arrows would be misleading.
  if (!query.get("q")) {
    const neighborsResponse = await backendFetch(
      `/items/${encodeURIComponent(id)}/neighbors${queryString ? `?${queryString}` : ""}`,
    );

    if (neighborsResponse.ok) {
      const neighbors = (await neighborsResponse.json()) as ItemNeighborsResponse;
      const suffix = queryString ? `?${queryString}` : "";

      prevHref = neighbors.prev_id ? `/items/${neighbors.prev_id}${suffix}` : null;
      nextHref = neighbors.next_id ? `/items/${neighbors.next_id}${suffix}` : null;
    }
  }

  return (
    <main>
      <p className={styles.back}>
        <Link href={backHref}>← К записям</Link>
      </p>

      <PageHeader
        action={
          <>
            {item.external_source === "tmdb" ? (
              <RefreshMovieButton itemId={item.id} />
            ) : null}
            <ItemActions itemId={item.id} title={item.title} />
          </>
        }
        subtitle={item.subtitle ?? undefined}
        title={
          <>
            {item.title}
            {item.year ? <span className={styles.year}> ({item.year})</span> : null}
          </>
        }
      />

      <div className={styles.stack}>
        <ItemNeighbors nextHref={nextHref} prevHref={prevHref} />
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
          </Card>
        </div>

        {item.details ? (
          <MovieInfo
            details={item.details}
            tmdbId={
              item.external_source === "tmdb" ? item.external_id : null
            }
          />
        ) : null}

        {item.review ? (
          <Card title="Заметка">
            <p className={styles.review}>{item.review}</p>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
