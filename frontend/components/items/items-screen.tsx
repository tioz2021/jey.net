"use client";

import { useEffect, useState } from "react";

import { ItemsFilters } from "@/components/items/filters";
import { ItemCard } from "@/components/items/item-card";
import { useItemsQuery } from "@/components/items/query-context";
import { Button } from "@/components/ui";
import { useCatalogueSource } from "@/lib/data-source";
import { useI18n } from "@/lib/locale-context";
import { describeError } from "@/lib/messages";
import type { Item, ItemKind, ItemStatus, Sort } from "@/lib/types";
import { LoadingScreen } from "@/components/loading-screen";
import { NotebookTabs } from "@/components/notebook-tabs";
import { KindChips } from "@/components/items/kind-chips";
import { ActiveFilterBar } from "@/components/items/active-filter-bar";
import { ViewSwitch } from "@/components/view-switch";
import { api } from "@/lib/api";

export function ItemsScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const source = useCatalogueSource();
  const { params, update } = useItemsQuery();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "grid">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const kind = (params.get("kind") as ItemKind | null) ?? undefined;
  const status = (params.get("status") as ItemStatus | null) ?? undefined;
  const query = params.get("q") ?? "";
  const sort = (params.get("sort") as Sort | null) ?? undefined;
  const hasExtraFilters = ["q", "status", "month"].some((key) => params.has(key))
    || (params.has("sort") && params.get("sort") !== "created_desc");

  function clearExtraFilters() {
    update((next) => {
      for (const key of [...next.keys()]) {
        if (key !== "kind") next.delete(key);
      }
    });
  }

  useEffect(() => {
    const refresh = () => setRefreshTick((value) => value + 1);
    window.addEventListener("jey:sync-complete", refresh);
    window.addEventListener("jey:item-refreshed", refresh);
    return () => {
      window.removeEventListener("jey:sync-complete", refresh);
      window.removeEventListener("jey:item-refreshed", refresh);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    source.list({ kind, status, q: query || undefined, sort, limit: 100 })
      .then(async (response) => {
        if (cancelled) return;
        setItems(response.items);
        if (source.coverData) {
          const loaded: Record<string, string> = {};
          await Promise.all(response.items.map(async (item) => {
            if (!item.cover_key) return;
            const data = await source.coverData?.(item.cover_key);
            if (data) loaded[item.cover_key] = data;
          }));
          if (!cancelled) setCovers(loaded);
        }
      })
      .catch((cause) => { if (!cancelled) setError(describeError(cause, i18n).text); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, status, query, sort, source, refreshTick]);

  async function trashSelected() {
    if (selected.size === 0 || !window.confirm(`Отправить в корзину: ${selected.size}?`)) return;
    setLoading(true);
    try {
      await Promise.all([...selected].map((id) => api.items.remove(id)));
      setItems((current) => current.filter((item) => !selected.has(item.id)));
      setSelected(new Set());
      setSelectionMode(false);
      window.dispatchEvent(new Event("jey:item-refreshed"));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <main>
      <NotebookTabs />
      <div className="catalogue-toolbar">
        <KindChips />
      </div>
      <div className="catalogue-filter-row">
        <ViewSwitch onChange={setView} value={view} />
        <ItemsFilters compact showActive={false} />
        <button
          aria-label="Выбрать записи"
          aria-pressed={selectionMode}
          className={`selection-toggle ${selectionMode ? "selection-toggle-on" : ""}`}
          onClick={() => {
            setSelectionMode((value) => {
              if (value) setSelected(new Set());
              return !value;
            });
          }}
          title={selectionMode ? "Выйти из выбора" : "Выбрать записи"}
          type="button"
        >
          <span aria-hidden="true" className="selection-box">
            {selectionMode && selected.size > 0 ? selected.size : ""}
          </span>
          <svg aria-hidden="true" fill="none" height="10" viewBox="0 0 24 24" width="10">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </div>
      <ActiveFilterBar />
      {selectionMode ? (
        <div className="selection-bar">
          <span>Выбрано: {selected.size}</span>
          <Button onClick={() => { setSelectionMode(false); setSelected(new Set()); }} size="sm" variant="secondary">Снять выбор</Button>
          <Button disabled={selected.size === 0} onClick={() => void trashSelected()} size="sm" variant="danger">В корзину</Button>
        </div>
      ) : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : loading && items.length === 0 ? <LoadingScreen /> : items.length === 0 ? (
        <div className="catalogue-empty">
          <p>{hasExtraFilters ? "По этим условиям ничего не нашлось." : "Записей пока нет."}</p>
        </div>
      ) : (
        <ul aria-busy={loading} className={view === "grid" ? "items-grid" : "items-list"} style={{ opacity: loading ? 0.55 : 1, transition: "opacity 120ms ease" }}>
          {items.map((item) => (
            <li key={item.id} style={{ position: "relative" }}>
              <ItemCard
                coverSrc={item.cover_key ? covers[item.cover_key] : undefined}
                href={selectionMode ? undefined : `/items/${item.id}`}
                item={item}
                onOpen={selectionMode ? () => toggle(item.id) : undefined}
                selected={selectionMode && selected.has(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
