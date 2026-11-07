import type { ReactNode } from "react";

import { CardBoundary } from "../CardBoundary";
import { ItemCard } from "@/components/items/item-card";
import {
  IconAnime,
  IconBook,
  IconFilm,
  IconGame,
  IconList,
  IconTv,
} from "@/components/icons";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { Item, ItemKind, ItemStatus } from "@/lib/types";

import type { LocalItem } from "../data/source";

export const KINDS: Array<{ kind: ItemKind | null; label: string; Icon: typeof IconList }> = [
  { kind: null, label: "Все записи", Icon: IconList },
  { kind: "movie", label: "Фильмы", Icon: IconFilm },
  { kind: "tv", label: "Сериалы", Icon: IconTv },
  { kind: "anime", label: "Аниме", Icon: IconAnime },
  { kind: "book", label: "Книги", Icon: IconBook },
  { kind: "game", label: "Игры", Icon: IconGame },
];

export interface CatalogPageProps {
  items: LocalItem[];
  displayItems: LocalItem[];
  covers: Record<string, string>;
  counts: Map<string, number>;
  query: string;
  kindFilter: ItemKind | null;
  statusFilter: ItemStatus | "";
  error?: string;
  syncMessage?: string;
  action?: string;
  syncStatus?: { changes_after: number; last_seq: number } | null;
  syncing?: boolean;
  onQueryChange: (value: string) => void;
  onKindChange: (kind: ItemKind | null) => void;
  onStatusChange: (status: ItemStatus | "") => void;
  onReset: () => void;
  onCreate: () => void;
  onOpen: (item: LocalItem) => void;
  onSync?: () => void;
  header?: ReactNode;
}

/** Framework-neutral catalogue content; web and desktop provide their own shell. */
export function CatalogPage({
  items,
  displayItems,
  covers,
  counts,
  query,
  kindFilter,
  statusFilter,
  error,
  syncMessage,
  action,
  syncStatus,
  syncing = false,
  onQueryChange,
  onKindChange,
  onStatusChange,
  onReset,
  onCreate,
  onOpen,
  onSync,
  header,
}: CatalogPageProps) {
  const { t } = useI18n();

  return (
    <>
      {header}
      <div className="desktop-layout">
        <aside className="desktop-sidebar">
          <Card title="Типы">
            <div className="desktop-type-list">
              {KINDS.map(({ kind, label, Icon }) => (
                <button
                  className={`desktop-type ${kindFilter === kind ? "desktop-type-active" : ""}`}
                  key={label}
                  onClick={() => onKindChange(kind)}
                  type="button"
                >
                  <Icon size={14} />
                  <span>{label}</span>
                  <span className="desktop-type-count">
                    {kind ? counts.get(kind) ?? 0 : items.length}
                  </span>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Фильтры">
            <div className="desktop-filter-form">
              <Input
                label="Поиск"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Название или автор"
              />
              <Select
                label="Статус"
                value={statusFilter}
                onChange={(event) => onStatusChange(event.target.value as ItemStatus | "")}
              >
                <option value="">Любой статус</option>
                <option value="planned">Запланировано</option>
                <option value="in_progress">В процессе</option>
                <option value="done">Готово</option>
                <option value="dropped">Брошено</option>
              </Select>
              <Button onClick={onReset} type="button" variant="secondary">Сбросить</Button>
            </div>
          </Card>
        </aside>

        <div className="desktop-main">
          <PageHeader
            action={<Button onClick={onCreate}>Добавить запись</Button>}
            title={t("nav.items")}
          />
          {syncStatus && syncStatus.changes_after > 0 ? (
            <div className="desktop-banner">
              Есть изменения в вебе: {syncStatus.changes_after}.{" "}
              <button className="desktop-banner-action" onClick={onSync} type="button">
                Синхронизировать
              </button>
            </div>
          ) : null}
          {error ? <p className="desktop-error">{error}</p> : null}
          {syncMessage ? <p className="desktop-sync-result">{syncMessage}</p> : null}
          {action ? <p className="desktop-muted desktop-path">{action}</p> : null}
          <ul className="desktop-list">
            {displayItems.map((item) => (
              <li key={item.id} className="desktop-list-item">
                <CardBoundary title={item.title}>
                  <ItemCard
                    coverSrc={item.cover_key ? covers[item.cover_key] : undefined}
                    item={item as Item}
                    href={`#${item.id}`}
                    onOpen={() => onOpen(item)}
                  />
                </CardBoundary>
              </li>
            ))}
          </ul>
          {displayItems.length === 0 ? <p className="desktop-empty">Записей пока нет.</p> : null}
        </div>
      </div>
    </>
  );
}
