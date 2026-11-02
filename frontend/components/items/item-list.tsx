"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { Item, ItemFilters, ItemKind, ItemStatus, Sort } from "@/lib/types";

import { ItemsFilters } from "./filters";
import { ItemCard } from "./item-card";
import styles from "./item-list.module.css";

const PAGE_SIZE = 20;

function parseFilters(params: URLSearchParams): ItemFilters {
  const kind = params.get("kind");
  const status = params.get("status");
  const sort = params.get("sort");
  const tag = params.get("tag");

  return {
    kind: kind ? (kind as ItemKind) : undefined,
    status: status ? (status as ItemStatus) : undefined,
    sort: sort ? (sort as Sort) : undefined,
    tag: tag ?? undefined,
    include_deleted: params.get("deleted") === "1",
    limit: PAGE_SIZE,
  };
}

export function ItemList() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);
  const hasFilters = ["kind", "status", "tag"].some((key) =>
    searchParams.has(key),
  );

  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setCursor(null);

    api.items
      .list(filters)
      .then((page) => {
        if (!cancelled) {
          setItems(page.items);
          setCursor(page.next_cursor);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filters, reloadToken]);

  async function loadMore() {
    if (!cursor) {
      return;
    }

    setLoadingMore(true);
    try {
      const page = await api.items.list({ ...filters, cursor });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.next_cursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className={styles.layout}>
      <ItemsFilters />

      {error ? (
        <div className={styles.state} role="alert">
          <p className={styles.stateTitle}>Не удалось загрузить записи</p>
          <p className={styles.stateText}>{error}</p>
          <Button
            variant="secondary"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            Повторить
          </Button>
        </div>
      ) : loading ? (
        <div className={styles.list} aria-busy="true">
          <Skeleton height="6.5rem" />
          <Skeleton height="6.5rem" />
          <Skeleton height="6.5rem" />
        </div>
      ) : items.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>
            {hasFilters ? "Ничего не найдено" : "Записей пока нет"}
          </p>
          <p className={styles.stateText}>
            {hasFilters
              ? "Попробуйте изменить фильтры."
              : "Добавьте первый фильм, книгу или картинку — они появятся здесь."}
          </p>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} />
              </li>
            ))}
          </ul>

          {cursor ? (
            <div className={styles.more}>
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={loadMore}
              >
                Показать ещё
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
