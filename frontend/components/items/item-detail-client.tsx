"use client";

import { useEffect, useState } from "react";

import { Button, Card, PageHeader } from "@/components/ui";
import { httpClientSource, type ClientSource } from "@/lib/client-source";
import type { CatalogItem } from "@/components/items/catalog-page";

import styles from "./item-detail-client.module.css";

const STATUS_LABELS: Record<string, string> = {
  planned: "Запланировано",
  in_progress: "В процессе",
  done: "Готово",
  dropped: "Брошено",
};

export function ItemDetailClient({
  id,
  source = httpClientSource,
  backHref = "/items",
  editHref,
  coverSrc,
}: {
  id: string;
  source?: ClientSource;
  backHref?: string;
  editHref?: string;
  coverSrc?: string;
}) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    source
      .get(id)
      .then((value) => {
        if (!cancelled) setItem(value);
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (loading) {
    return <main className={styles.page}><p>Загрузка…</p></main>;
  }

  if (error || !item) {
    return (
      <main className={styles.page}>
        <Card title="Запись не найдена">
          <p>{error || "Не удалось открыть запись."}</p>
          <a href={backHref}>← К записям</a>
        </Card>
      </main>
    );
  }

  const image = coverSrc ?? (item.cover_key ? `/media/${item.cover_key}` : null);

  return (
    <main className={styles.page}>
      <a className={styles.back} href={backHref}>← К записям</a>
      <PageHeader
        action={
          editHref ? <a className={styles.edit} href={editHref}>Редактировать</a> : undefined
        }
        subtitle={[item.subtitle, item.year].filter(Boolean).join(" · ")}
        title={item.title}
      />
      <div className={styles.layout}>
        <div className={styles.poster}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- local or API media
            <img alt="" src={image} />
          ) : (
            <span>{item.kind}</span>
          )}
        </div>
        <Card title="Запись">
          <dl className={styles.facts}>
            <div><dt>Тип</dt><dd>{item.kind}</dd></div>
            <div><dt>Статус</dt><dd>{STATUS_LABELS[item.status] ?? item.status}</dd></div>
            <div><dt>Оценка</dt><dd>{item.rating ? `${item.rating}/10` : "—"}</dd></div>
          </dl>
          {item.review ? <p className={styles.review}>{item.review}</p> : null}
          {item.source_url ? (
            <p><a href={item.source_url} rel="noreferrer" target="_blank">Источник</a></p>
          ) : null}
          <div className={styles.actions}>
            <Button
              onClick={() => {
                if (!window.confirm(`Удалить «${item.title}»?`)) return;
                void source.delete(item.id).then(() => {
                  window.location.href = backHref;
                });
              }}
              variant="secondary"
            >
              Удалить
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
