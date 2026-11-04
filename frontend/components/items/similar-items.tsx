"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { SimilarItem } from "@/lib/types";

import styles from "./similar-items.module.css";

export function SimilarItems({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<SimilarItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.items
      .similar(itemId)
      .then((response) => {
        if (!cancelled) setItems(response.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  if (items.length === 0) return null;

  return (
    <Card title={t("similar.title")}>
      <ul className={styles.list}>
        {items.slice(0, 6).map((item) => (
          <li key={`${item.source}-${item.external_id}`}>
            <a
              className={styles.card}
              href={item.href}
              rel="noreferrer"
              target="_blank"
            >
              {item.poster_path ? (
                // eslint-disable-next-line @next/next/no-img-element -- TMDB proxy
                <img
                  alt=""
                  src={`/api/v1/movies/image?size=w185&path=${encodeURIComponent(item.poster_path)}`}
                />
              ) : (
                <span aria-hidden="true" className={styles.placeholder} />
              )}
              <span className={styles.title}>{item.title}</span>
              {item.year ? <span className={styles.year}>{item.year}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
