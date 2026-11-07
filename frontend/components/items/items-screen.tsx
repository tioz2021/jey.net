"use client";

import { useEffect, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { AppLink } from "@/lib/navigation";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Item, ItemKind, ItemStatus, Stats } from "@/lib/types";

export function ItemsScreen() {
  const { t } = useI18n();
  const initial = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [kind, setKind] = useState<ItemKind | undefined>((initial.get("kind") as ItemKind | null) ?? undefined);
  const [status, setStatus] = useState<ItemStatus | undefined>((initial.get("status") as ItemStatus | null) ?? undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.items.list({ kind, status, q: query || undefined, limit: 100 })
      .then((response) => { if (!cancelled) setItems(response.items); })
      .catch((cause) => { if (!cancelled) setError(String(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, status, query]);

  useEffect(() => { api.stats.get().then(setStats).catch(() => {}); }, []);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    if (value) next.set(key, value); else next.delete(key);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `${window.location.pathname}${next.toString() ? `?${next}` : ""}`);
    if (key === "kind") setKind((value as ItemKind) || undefined);
    if (key === "status") setStatus((value as ItemStatus) || undefined);
  }

  function reset() {
    if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
    setQuery("");
    setKind(undefined);
    setStatus(undefined);
  }

  return (
    <main>
      <PageHeader action={<AppLink className="ui-button" href="/items/new">Добавить запись</AppLink>} title={t("nav.items")} />
      <Card title="Фильтры">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "end" }}>
          <Input label="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или автор" />
          <Select label="Тип" value={kind ?? ""} onChange={(event) => setParam("kind", event.target.value)}>
            <option value="">Все типы</option><option value="movie">Фильмы</option><option value="tv">Сериалы</option><option value="anime">Аниме</option><option value="book">Книги</option><option value="game">Игры</option>
          </Select>
          <Select label="Статус" value={status ?? ""} onChange={(event) => setParam("status", event.target.value)}>
            <option value="">Любой статус</option><option value="planned">Запланировано</option><option value="in_progress">В процессе</option><option value="done">Готово</option><option value="dropped">Брошено</option>
          </Select>
          <Button variant="secondary" onClick={() => { reset() }}>Сбросить</Button>
        </div>
      </Card>
      {stats ? <p style={{ color: "var(--color-text-muted)" }}>Записей: {stats.total}</p> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}
      {loading ? <p>Загрузка…</p> : items.length === 0 ? <p>Записей пока нет.</p> : (
        <ul style={{ display: "grid", gap: "0.75rem", padding: 0, margin: "0.75rem 0", listStyle: "none" }}>
          {items.map((item) => <li key={item.id}><ItemCard href={`/items/${item.id}`} item={item} /></li>)}
        </ul>
      )}
    </main>
  );
}
