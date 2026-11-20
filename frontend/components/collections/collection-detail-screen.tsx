"use client";

import { useEffect, useMemo, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { RemoveFromCollection } from "@/components/remove-from-collection";
import { AppLink } from "@/lib/navigation";
import { NotebookTabs } from "@/components/notebook-tabs";
import { Badge, Button, Card, Dialog, Input } from "@/components/ui";
import { IconFilm, IconPencil, IconPlus } from "@/components/icons";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { mediaUrl } from "@/lib/media";
import type { CollectionDetail, Item } from "@/lib/types";

import styles from "./collection-detail-screen.module.css";
import { LoadingScreen } from "@/components/loading-screen";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { readViewPreference, saveViewPreference } from "@/lib/view-preference";

export function CollectionDetailScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<ViewMode>(() => readViewPreference("jey:view:collections", "grid"));
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editError, setEditError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItems, setPickerItems] = useState<Item[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    api.collections.detail(id).then(setData).catch(() => setError(true));
  }, [id]);

  const available = useMemo(() => {
    const existing = new Set(data?.items.map((item) => item.id) ?? []);
    const query = search.trim().toLocaleLowerCase();
    return pickerItems.filter(
      (item) =>
        !existing.has(item.id) &&
        (!query || item.title.toLocaleLowerCase().includes(query)),
    );
  }, [data?.items, pickerItems, search]);

  function openRename() {
    if (!data) return;
    setEditTitle(data.collection.title);
    setEditError("");
    setEditing(true);
  }

  async function rename() {
    if (!data || !editTitle.trim() || busy) return;
    setBusy(true);
    setEditError("");
    try {
      await api.collections.update(id, {
        title: editTitle.trim(),
        visibility: data.collection.visibility,
      });
      setData((current) =>
        current
          ? { ...current, collection: { ...current.collection, title: editTitle.trim() } }
          : current,
      );
      setEditing(false);
      window.dispatchEvent(new Event("jey:collections-changed"));
    } catch {
      setEditError(t("collections.renameError"));
    } finally {
      setBusy(false);
    }
  }

  function openPicker() {
    setPickerOpen(true);
    setPickerError("");
    if (pickerItems.length > 0) return;
    setPickerLoading(true);
    api.items
      .list({ limit: 100 })
      .then((response) => setPickerItems(response.items))
      .catch(() => setPickerError(t("collections.loadError")))
      .finally(() => setPickerLoading(false));
  }

  async function addItem(item: Item) {
    if (addingId) return;
    setAddingId(item.id);
    try {
      await api.collections.addItem(id, item.id);
      setData((current) =>
        current ? { ...current, items: [...current.items, item] } : current,
      );
      window.dispatchEvent(new Event("jey:collections-changed"));
    } catch {
      setPickerError(t("collections.addError"));
    } finally {
      setAddingId(null);
    }
  }

  if (error) {
    return (
      <main>
        <NotebookTabs />
        <Card title={t("collections.loadError")}>
          <AppLink href="/collections">{t("collections.title")}</AppLink>
        </Card>
      </main>
    );
  }

  if (!data) return <main><LoadingScreen /></main>;

  return (
    <main>
      <NotebookTabs />
      <header className={styles.header}>
        <div className={styles.titleLine}>
          <h1>{data.collection.title}</h1>
          <button
            aria-label={t("collections.rename")}
            className={styles.rename}
            onClick={openRename}
            title={t("collections.rename")}
            type="button"
          >
            <IconPencil size={15} />
          </button>
          <Badge tone={data.collection.visibility === "public" ? "success" : "neutral"}>
            {data.collection.visibility === "public"
              ? t("collections.public")
              : t("collections.private")}
          </Badge>
        </div>
      </header>
      <div className={`section-toolbar ${styles.controls}`}>
        <ViewSwitch
          onChange={(value) => {
            setView(value);
            saveViewPreference("jey:view:collections", value);
          }}
          value={view}
        />
        <Button onClick={openPicker} size="sm" variant="secondary">
          <IconPlus size={15} />
          {t("collections.addItems")}
        </Button>
      </div>
      {data.items.length === 0 ? (
        <p className={styles.empty}>{t("collections.empty")}</p>
      ) : (
        <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
          {data.items.map((item) => (
            <li key={item.id}>
              <ItemCard
                footer={<RemoveFromCollection collectionId={id} itemId={item.id} />}
                href={`/items/${item.id}`}
                item={item}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        footer={
          <>
            <Button onClick={() => setEditing(false)} variant="secondary">
              {t("common.cancel")}
            </Button>
            <Button disabled={!editTitle.trim() || busy} loading={busy} onClick={() => void rename()}>
              {t("common.save")}
            </Button>
          </>
        }
        onClose={() => setEditing(false)}
        open={editing}
        title={t("collections.renameTitle")}
      >
        <form onSubmit={(event) => { event.preventDefault(); void rename(); }}>
          <Input
            autoFocus
            error={editError || undefined}
            label={t("collections.name")}
            maxLength={80}
            onChange={(event) => setEditTitle(event.target.value)}
            value={editTitle}
          />
        </form>
      </Dialog>

      <Dialog
        footer={<Button onClick={() => setPickerOpen(false)} variant="secondary">{t("common.cancel")}</Button>}
        onClose={() => setPickerOpen(false)}
        open={pickerOpen}
        title={t("collections.addItemsTitle")}
      >
        <div className={styles.picker}>
          <Input
            label={t("collections.searchItems")}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("collections.searchItems")}
            value={search}
          />
          {pickerError ? <p className={styles.error}>{pickerError}</p> : null}
          {pickerLoading ? (
            <p className={styles.pickerEmpty}>{t("common.loading")}</p>
          ) : available.length === 0 ? (
            <p className={styles.pickerEmpty}>
              {pickerItems.length === 0
                ? t("collections.pickerNoRecords")
                : search.trim()
                  ? t("collections.noSearchResults")
                  : t("collections.allAdded")}
            </p>
          ) : (
            <ul className={styles.pickerList}>
              {available.map((item) => (
                <li className={styles.pickerItem} key={item.id}>
                  {item.cover_key ? (
                    <img alt="" className={styles.pickerCover} src={mediaUrl(item.cover_key)} />
                  ) : (
                    <span className={styles.pickerCoverPlaceholder}><IconFilm size={18} /></span>
                  )}
                  <span className={styles.pickerTitle}>
                    <strong>{item.title}</strong>
                    <span>{[item.kind, item.year].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Button
                    loading={addingId === item.id}
                    onClick={() => void addItem(item)}
                    size="sm"
                    variant="secondary"
                  >
                    {t("collections.add")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </main>
  );
}
