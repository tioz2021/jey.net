"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ItemsFilters } from "@/components/items/filters";
import { ItemCard } from "@/components/items/item-card";
import { useItemsQuery } from "@/components/items/query-context";
import { useAppRouter } from "@/lib/navigation";
import { Button, PageHeader } from "@/components/ui";
import { useCatalogueSource } from "@/lib/data-source";
import { useI18n } from "@/lib/locale-context";
import type { Item, ItemKind, ItemStatus, Sort } from "@/lib/types";
import { LoadingScreen } from "@/components/loading-screen";

export function ItemsScreen() {
  const { t } = useI18n();
  const router = useAppRouter();
  const source = useCatalogueSource();
  const { params } = useItemsQuery();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const kind = (params.get("kind") as ItemKind | null) ?? undefined;
  const status = (params.get("status") as ItemStatus | null) ?? undefined;
  const query = params.get("q") ?? "";
  const sort = (params.get("sort") as Sort | null) ?? undefined;

  useEffect(() => { setSlot(document.getElementById("items-filter-slot")); }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    source.list({ kind, status, q: query || undefined, sort, limit: 100 })
      .then((response) => { if (!cancelled) setItems(response.items); })
      .catch((cause) => { if (!cancelled) setError(String(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, status, query, sort, source]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <main>
      {slot ? createPortal(<ItemsFilters compact />, slot) : null}
      <PageHeader
        action={
          <>
            <Button onClick={() => router.push("/items/new")}>Добавить запись</Button>
            {selectionMode ? (
              <Button onClick={() => { setSelectionMode(false); setSelected(new Set()); }} variant="secondary">Отменить выбор</Button>
            ) : (
              <Button onClick={() => setSelectionMode(true)} variant="secondary">Выбрать записи</Button>
            )}
          </>
        }
        title={t("nav.items")}
      />
      {selectionMode ? <p style={{ color: "var(--color-text-muted)" }}>Выбрано: {selected.size}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      {loading ? <LoadingScreen /> : items.length === 0 ? <p>Записей пока нет.</p> : (
        <ul style={{ display: "grid", gap: "0.75rem", padding: 0, margin: "0.75rem 0", listStyle: "none" }}>
          {items.map((item) => (
            <li key={item.id} style={{ position: "relative" }}>
              {selectionMode ? <label style={{ position: "absolute", zIndex: 2, top: 8, left: 8 }}><input checked={selected.has(item.id)} onChange={() => toggle(item.id)} type="checkbox" /></label> : null}
              <ItemCard href={`/items/${item.id}`} item={item} selected={selectionMode && selected.has(item.id)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
