"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/skeletons";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { Item, ItemFilters, ItemKind, ItemStatus, Sort } from "@/lib/types";

import { ItemsFilters } from "./filters";
import { useItemsQuery } from "./query-context";
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
    q: params.get("q") ?? undefined,
    include_deleted: params.get("deleted") === "1",
    limit: PAGE_SIZE,
  };
}

export function ItemList() {
  const { params: searchParams } = useItemsQuery();
  const query = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);
  const hasFilters = ["kind", "status", "tag", "q"].some((key) =>
    searchParams.has(key),
  );

  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The skeleton is for the very first load only. After that the previous
  // list (even an empty state) stays on screen while filters change.
  const [loadedOnce, setLoadedOnce] = useState(false);
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
          setLoadedOnce(true);
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
        <EmptyState
          title="Не удалось загрузить записи"
          text={error}
          action={
            <Button
              variant="secondary"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Повторить
            </Button>
          }
        />
      ) : loading && !loadedOnce ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Ничего не найдено" : "Записей пока нет"}
          text={
            hasFilters
              ? "Попробуйте изменить фильтры или поисковый запрос."
              : "Добавьте первый фильм, книгу или картинку — они появятся здесь."
          }
          actionHref={hasFilters ? "/items" : "/items/new"}
          actionLabel={hasFilters ? "Сбросить фильтры" : "Добавить запись"}
        />
      ) : (
        <>
          <p aria-live="polite" className={styles.updating} role="status">
            {loading ? "Обновляем список…" : "\u00A0"}
          </p>

          <ul className={`${styles.list} ${loading ? styles.pending : ""}`}>
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} query={filters.q} />
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
