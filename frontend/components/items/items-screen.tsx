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
import { AppLink } from "@/lib/navigation";
import { KindChips } from "@/components/items/kind-chips";

export function ItemsScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const source = useCatalogueSource();
  const { params } = useItemsQuery();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const kind = (params.get("kind") as ItemKind | null) ?? undefined;
  const status = (params.get("status") as ItemStatus | null) ?? undefined;
  const query = params.get("q") ?? "";
  const sort = (params.get("sort") as Sort | null) ?? undefined;

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
        <AppLink className="catalogue-add" href="/items/new">
          Добавить запись <span aria-hidden="true">+</span>
        </AppLink>
      </div>
      <div className="catalogue-filter-row">
        <div className="view-switch" aria-label={t("view.label")}>
          <button
            aria-label={t("view.list")}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            type="button"
          >
            ☰
          </button>
          <button
            aria-label={t("view.grid")}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            type="button"
          >
            ▦
          </button>
        </div>
        <ItemsFilters compact />
      </div>
      {selectionMode ? <p style={{ color: "var(--color-text-muted)" }}>Выбрано: {selected.size}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : loading && items.length === 0 ? <LoadingScreen /> : items.length === 0 ? <p>Записей пока нет.</p> : (
        <ul aria-busy={loading} className={view === "grid" ? "items-grid" : "items-list"} style={{ opacity: loading ? 0.55 : 1, transition: "opacity 120ms ease" }}>
          {items.map((item) => (
            <li key={item.id} style={{ position: "relative" }}>
              {selectionMode ? <label style={{ position: "absolute", zIndex: 2, top: 8, left: 8 }}><input checked={selected.has(item.id)} onChange={() => toggle(item.id)} type="checkbox" /></label> : null}
              <ItemCard coverSrc={item.cover_key ? covers[item.cover_key] : undefined} href={`/items/${item.id}`} item={item} selected={selectionMode && selected.has(item.id)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
