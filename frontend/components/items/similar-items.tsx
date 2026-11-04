"use client";

import { useEffect, useState } from "react";

import { HideRecommendation } from "@/components/hide-recommendation";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import {
  similarRecommendationKey,
  useHiddenRecommendations,
} from "@/lib/use-hidden-recommendations";
import type { SimilarItem } from "@/lib/types";

import styles from "./similar-items.module.css";

export function SimilarItems({
  itemId,
  publicView = false,
}: {
  itemId: string;
  publicView?: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<SimilarItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const { hidden, hide } = useHiddenRecommendations();

  useEffect(() => {
    let cancelled = false;
    (publicView ? api.publicItems.similar(itemId) : api.items.similar(itemId))
      .then((response) => {
        if (!cancelled) setItems(response.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [itemId, publicView]);

  const visible = items.filter(
    (item) => !hidden.has(similarRecommendationKey(item.source, item.external_id)),
  );
  if (visible.length === 0) return null;

  return (
    <Card title={t("similar.title")}>
      <ul className={styles.list}>
        {(expanded ? visible : visible.slice(0, 6)).map((item) => (
          <li className={styles.withHide} key={`${item.source}-${item.external_id}`}>
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
              ) : item.cover_url || item.cover_id ? (
                // eslint-disable-next-line @next/next/no-img-element -- provider cover proxy
                <img
                  alt=""
                  src={
                    item.source === "igdb"
                      ? `/api/v1/games/image?url=${encodeURIComponent(item.cover_url ?? "")}`
                      : item.source === "anime" || item.kind === "anime"
                        ? `/api/v1/anime/image?url=${encodeURIComponent(item.cover_url ?? "")}`
                        : item.source === "openlibrary" && item.cover_id
                          ? `/api/v1/books/image?size=M&cover=${encodeURIComponent(String(item.cover_id))}`
                          : `/api/v1/books/image?url=${encodeURIComponent(item.cover_url ?? "")}`
                  }
                />
              ) : (
                <span aria-hidden="true" className={styles.placeholder} />
              )}
              <span className={styles.title}>{item.title}</span>
              {item.year ? <span className={styles.year}>{item.year}</span> : null}
            </a>
            <HideRecommendation
              compact
              onHide={() => hide(similarRecommendationKey(item.source, item.external_id))}
            />
          </li>
        ))}
      </ul>
      {visible.length > 6 ? (
        <Button
          onClick={() => setExpanded((value) => !value)}
          size="sm"
          variant="ghost"
        >
          {expanded
            ? t("similar.collapse")
            : t("similar.showAll", { count: visible.length })}
        </Button>
      ) : null}
    </Card>
  );
}
