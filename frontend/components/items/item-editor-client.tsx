"use client";

import { useEffect, useState } from "react";

import { Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { httpClientSource, type ClientSource } from "@/lib/client-source";
import type { CatalogItem } from "@/components/items/catalog-page";
import type { ItemKind, ItemStatus, NewItem } from "@/lib/types";

const KINDS: Array<[ItemKind, string]> = [
  ["movie", "Фильм"],
  ["tv", "Сериал"],
  ["anime", "Аниме"],
  ["book", "Книга"],
  ["game", "Игра"],
];

const STATUSES: Array<[ItemStatus, string]> = [
  ["planned", "Запланировано"],
  ["in_progress", "В процессе"],
  ["done", "Готово"],
  ["dropped", "Брошено"],
];

export function ItemEditorClient({
  id,
  source = httpClientSource,
  backHref = "/items",
}: {
  id?: string;
  source?: ClientSource;
  backHref?: string;
}) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ItemKind>("movie");
  const [status, setStatus] = useState<ItemStatus>("planned");
  const [rating, setRating] = useState("");
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    source.get(id).then((value) => {
      if (!value) return;
      setItem(value);
      setTitle(value.title);
      setKind(value.kind);
      setStatus(value.status);
      setRating(value.rating == null ? "" : String(value.rating));
      setReview(value.review ?? "");
    });
  }, [id, source]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const numericRating = rating.trim() === "" ? null : Number(rating);
      const patch = {
        title: title.trim(),
        kind,
        status,
        rating: numericRating && numericRating >= 1 && numericRating <= 10 ? numericRating : null,
        review,
      };
      const saved = item
        ? await source.update(item.id, patch)
        : await source.create(patch as NewItem);
      if (saved) window.location.href = `/items/${saved.id}`;
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="desktop-detail">
      <a href={backHref}>← К записям</a>
      <PageHeader title={item ? "Редактировать запись" : "Добавить запись"} />
      <Card>
        <form className="desktop-form desktop-form-column" onSubmit={submit}>
          <Select label="Тип" value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}>
            {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Input autoFocus label="Название" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={300} />
          <Select label="Статус" value={status} onChange={(event) => setStatus(event.target.value as ItemStatus)}>
            {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Input label="Оценка (1–10)" type="number" min={1} max={10} value={rating} onChange={(event) => setRating(event.target.value)} />
          <Textarea label="Рецензия" value={review} onChange={(event) => setReview(event.target.value)} rows={8} />
          {error ? <p className="desktop-error">{error}</p> : null}
          <div className="desktop-actions">
            <Button loading={busy} type="submit">{item ? "Сохранить" : "Добавить"}</Button>
            <Button
              onClick={() => {
                window.location.href = backHref;
              }}
              type="button"
              variant="secondary"
            >
              Отмена
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
