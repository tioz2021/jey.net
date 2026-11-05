"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Select } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { Onboarding } from "@/components/onboarding";
import { useI18n } from "@/lib/locale-context";
import { STATUS_KEYS } from "@/lib/i18n/labels";
import { ListSkeleton } from "@/components/skeletons";
import { api } from "@/lib/api";
import { describeError } from "@/lib/messages";
import type { Item, ItemFilters, ItemKind, ItemStatus, Sort } from "@/lib/types";

import { ItemsFilters } from "./filters";
import { SearchBox } from "./search-box";
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
    month: params.get("month") ?? undefined,
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
  const i18n = useI18n();
  const { t } = i18n;
  const { params: searchParams, update } = useItemsQuery();
  const query = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);
  const hasFilters = ["kind", "status", "tag", "q", "month"].some((key) =>
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ItemStatus | "">("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const [bulkChanged, setBulkChanged] = useState(false);

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
          setError(describeError(cause, i18n).text);
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
  }, [filters, query, reloadToken, i18n]);

  useEffect(() => {
    if (!loading) {
      setShowSlowHint(false);
      return;
    }

    const timer = window.setTimeout(() => setShowSlowHint(true), 250);

    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    setSelected(new Set());
    setSelectionMode(false);
    setBulkChanged(false);
  }, [query]);

  useEffect(() => {
    if (!selectionMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectionMode(false);
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectionMode]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function selectAll() {
    setSelectAllBusy(true);
    try {
      const { ids } = await api.items.ids(filters);
      setSelected(new Set(ids));
    } finally {
      setSelectAllBusy(false);
    }
  }

  async function runBulk(action: "status" | "trash" | "restore") {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const ids = [...selected];
      if (action === "status" && bulkStatus) {
        await Promise.all(
          ids.map((id) => api.items.update(id, { status: bulkStatus })),
        );
      } else if (action === "trash") {
        await Promise.all(ids.map((id) => api.items.remove(id)));
      } else if (action === "restore") {
        await Promise.all(ids.map((id) => api.items.restore(id)));
      }
      setSelected(new Set());
      setBulkStatus("");
      setBulkChanged(true);
      setReloadToken((value) => value + 1);
    } catch (cause) {
      setError(describeError(cause, i18n).text);
    } finally {
      setBulkBusy(false);
    }
  }

  const selectedItems = items.filter((item) => selected.has(item.id));
  // Selected ids can include pages not loaded yet, so the action row follows
  // the selection itself; deleted entries only affect the restore action.
  const hasActiveSelection = selected.size > 0;
  const hasDeletedSelection = selectedItems.some((item) => item.deleted_at);

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
      setError(describeError(cause, i18n).text);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.mobileSearch}>
        <SearchBox />
      </div>
      <ItemsFilters
        onSelect={() => {
          setSelectionMode(true);
          setSelected(new Set());
          setBulkChanged(false);
        }}
        selectionMode={selectionMode}
      />

      {selectionMode ? (
        <div className={styles.bulk} role="region" aria-label={t("bulk.title")}>
          <div className={styles.bulkTop}>
            <div className={styles.bulkSummary}>
              <span className={styles.bulkCount}>
                {t("bulk.selected", { count: selected.size })}
              </span>
              <button
                className={styles.bulkSelectAll}
                disabled={selectAllBusy}
                onClick={() => void selectAll()}
                type="button"
              >
                {selectAllBusy ? "…" : t("bulk.selectAll")}
              </button>
              {selected.size > 0 ? (
                <button
                  className={styles.bulkClear}
                  onClick={() => setSelected(new Set())}
                  type="button"
                >
                  {t("bulk.clear")}
                </button>
              ) : null}
            </div>
            <button
              className={styles.bulkDone}
              onClick={() => {
                setSelectionMode(false);
                setSelected(new Set());
                setBulkChanged(false);
              }}
              type="button"
            >
              {bulkChanged ? t("bulk.done") : t("bulk.close")}
            </button>
          </div>
          <p className={styles.bulkHint}>{t("bulk.hint")}</p>
          <div className={styles.bulkActions}>
            {hasActiveSelection ? (
              <>
                <Select
                  className={styles.bulkStatus}
                  hideLabel
                  label={t("bulk.status")}
                  value={bulkStatus}
                  onChange={(event) =>
                    setBulkStatus(event.target.value as ItemStatus | "")
                  }
                >
                  <option value="">{t("bulk.status")}</option>
                  {(
                    ["planned", "in_progress", "done", "dropped"] as ItemStatus[]
                  ).map((status) => (
                    <option key={status} value={status}>
                      {t(STATUS_KEYS[status])}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={!bulkStatus || bulkBusy}
                  onClick={() => void runBulk("status")}
                  variant="secondary"
                >
                  {t("bulk.apply")}
                </Button>
                <Button
                  disabled={bulkBusy}
                  onClick={() => void runBulk("trash")}
                  variant="secondary"
                >
                  {t("bulk.trash")}
                </Button>
              </>
            ) : null}
            {hasDeletedSelection ? (
              <Button
                disabled={bulkBusy}
                onClick={() => void runBulk("restore")}
                variant="secondary"
              >
                {t("bulk.restore")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <EmptyState
          title={t("items.errorTitle")}
          text={error}
          action={
            <Button
              variant="secondary"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              {t("items.retry")}
            </Button>
          }
        />
      ) : loading && !loadedOnce ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            action={
              <Button
                onClick={() =>
                  update((params) => {
                    for (const key of [...params.keys()]) {
                      params.delete(key);
                    }
                  })
                }
              >
                {t("filters.reset")}
              </Button>
            }
            text={t("items.empty.searchText")}
            title={t("items.empty.searchTitle")}
            variant="search"
          />
        ) : (
          <Onboarding
            fallback={
              <EmptyState
                actionHref="/items/new"
                actionLabel={t("items.empty.noneAction")}
                text={t("items.empty.noneText")}
                title={t("items.empty.noneTitle")}
                variant="records"
              />
            }
          />
        )
      ) : (
        <>
          {showSlowHint ? (
            <p aria-live="polite" className={styles.updating} role="status">
              {t("items.updating")}
            </p>
          ) : null}

          <ul className={styles.list}>
            {items.map((item) => (
              <li className={styles.item} key={item.id}>
                {selectionMode ? (
                  <label className={styles.select}>
                    <input
                      aria-label={t("bulk.select", { title: item.title })}
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      type="checkbox"
                    />
                    <span aria-hidden="true" className={styles.check} />
                  </label>
                ) : null}
                <ItemCard
                  href={`/items/${item.id}${query ? `?${query}` : ""}`}
                  item={item}
                  query={filters.q}
                  selected={selectionMode && selected.has(item.id)}
                />
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
