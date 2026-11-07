import type { ReactNode } from "react";

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
import styles from "./catalog-page.module.css";

export type CatalogItem = Item & { pending?: boolean };

export const KINDS: Array<{ kind: ItemKind | null; label: string; Icon: typeof IconList }> = [
  { kind: null, label: "Все записи", Icon: IconList },
  { kind: "movie", label: "Фильмы", Icon: IconFilm },
  { kind: "tv", label: "Сериалы", Icon: IconTv },
  { kind: "anime", label: "Аниме", Icon: IconAnime },
  { kind: "book", label: "Книги", Icon: IconBook },
  { kind: "game", label: "Игры", Icon: IconGame },
];

export interface CatalogPageProps {
  items: CatalogItem[];
  displayItems: CatalogItem[];
  covers: Record<string, string>;
  counts: Map<string, number>;
  query: string;
  kindFilter: ItemKind | null;
  statusFilter: ItemStatus | "";
  error?: string;
  syncMessage?: string;
  action?: string;
  syncStatus?: { changes_after: number; last_seq: number } | null;
  onQueryChange: (value: string) => void;
  onKindChange: (kind: ItemKind | null) => void;
  onStatusChange: (status: ItemStatus | "") => void;
  onReset: () => void;
  onCreate: () => void;
  onOpen?: (item: CatalogItem) => void;
  onSync?: () => void;
  header?: ReactNode;
  hrefFor?: (item: CatalogItem) => string;
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
  onQueryChange,
  onKindChange,
  onStatusChange,
  onReset,
  onCreate,
  onOpen,
  onSync,
  header,
  hrefFor,
}: CatalogPageProps) {
  const { t } = useI18n();

  return (
    <>
      {header}
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Card title="Типы">
            <div className={styles.typeList}>
              {KINDS.map(({ kind, label, Icon }) => (
                <button
                  className={`${styles.type} ${kindFilter === kind ? styles.typeActive : ""}`}
                  key={label}
                  onClick={() => onKindChange(kind)}
                  type="button"
                >
                  <Icon size={14} />
                  <span>{label}</span>
                  <span className={styles.typeCount}>
                    {kind ? counts.get(kind) ?? 0 : items.length}
                  </span>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Фильтры">
            <div className={styles.filterForm}>
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

        <div className={styles.main}>
          <PageHeader
            action={<Button onClick={onCreate}>Добавить запись</Button>}
            title={t("nav.items")}
          />
          {syncStatus && syncStatus.changes_after > 0 ? (
            <div className={styles.banner}>
              Есть изменения в вебе: {syncStatus.changes_after}.{" "}
              <button className={styles.bannerAction} onClick={onSync} type="button">
                Синхронизировать
              </button>
            </div>
          ) : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          {syncMessage ? <p className={styles.syncResult}>{syncMessage}</p> : null}
          {action ? <p className={`${styles.muted} ${styles.path}`}>{action}</p> : null}
          <ul className={styles.list}>
            {displayItems.map((item) => (
              <li key={item.id} className={styles.listItem}>
                <ItemCard
                  coverSrc={item.cover_key ? covers[item.cover_key] : undefined}
                  item={item}
                  href={hrefFor ? hrefFor(item) : `#${item.id}`}
                  onOpen={onOpen ? () => onOpen(item) : undefined}
                />
              </li>
            ))}
          </ul>
          {displayItems.length === 0 ? <p className={styles.empty}>Записей пока нет.</p> : null}
        </div>
      </div>
    </>
  );
}
