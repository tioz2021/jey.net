"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export function ItemList({
  initialItems = [],
  initialCursor = null,
  initialLoaded = false,
  initialQuery = "",
}: {
  initialItems?: Item[];
  initialCursor?: string | null;
  initialLoaded?: boolean;
  initialQuery?: string;
}) {
  const { params: searchParams } = useItemsQuery();
  const query = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);
  const hasFilters = ["kind", "status", "tag", "q"].some((key) =>
    searchParams.has(key),
  );

  const [items, setItems] = useState<Item[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(!initialLoaded);
  // The skeleton is for the very first load only. After that the previous
  // list (even an empty state) stays on screen while filters change.
  const [loadedOnce, setLoadedOnce] = useState(initialLoaded);
  // The server already rendered this exact query; do not fetch it again.
  const skipQuery = useRef<string | null>(initialLoaded ? initialQuery : null);
  // A slow request shows a status line; a fast one changes nothing on screen.
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (skipQuery.current !== null) {
      const skip = skipQuery.current === query;
      skipQuery.current = null;
      if (skip) {
        return;
      }
    }

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
  }, [filters, query, reloadToken]);

  useEffect(() => {
    if (!loading) {
      setShowSlowHint(false);
      return;
    }

    const timer = window.setTimeout(() => setShowSlowHint(true), 250);

    return () => window.clearTimeout(timer);
  }, [loading]);

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
          {showSlowHint ? (
            <p aria-live="polite" className={styles.updating} role="status">
              Обновляем список…
            </p>
          ) : null}

          <ul className={styles.list}>
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
