"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { NotebookTabs } from "@/components/notebook-tabs";
import { LoadingScreen } from "@/components/loading-screen";
import { IconGlobe, IconLock, IconPencil, IconTrash } from "@/components/icons";
import { AppLink } from "@/lib/navigation";
import { Badge, Button, Card, Dialog, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useCatalogueSource } from "@/lib/data-source";
import { useI18n } from "@/lib/locale-context";
import { KIND_PLURAL_KEYS } from "@/lib/i18n/labels";
import { useAppRouter } from "@/lib/navigation";
import { useToast } from "@/components/toasts";
import { useUser } from "@/lib/user-context";
import { mediaUrl } from "@/lib/media";
import type { Item, TierListDetail, TierListItem, TierName } from "@/lib/types";

import styles from "./tiers.module.css";

const TIERS: TierName[] = ["S", "A", "B", "C", "D", "E", "F"];

export function TierDetailScreen() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const router = useAppRouter();
  const { notify, notifyError } = useToast();
  const { user } = useUser();
  const source = useCatalogueSource();
  const [data, setData] = useState<TierListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogue, setCatalogue] = useState<Item[]>([]);
  const [poolTier, setPoolTier] = useState<TierName>("S");
  const [dragged, setDragged] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ tier: TierName; index: number } | null>(null);
  const [overPool, setOverPool] = useState(false);
  const suppressPoolClick = useRef(false);

  useEffect(() => {
    api.tierLists
      .detail(id)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void source.list({ limit: 100 }).then((response) => setCatalogue(response.items));
  }, [source]);

  const used = useMemo(() => new Set(data?.items.map((item) => item.id)), [data]);
  const previewing = Boolean(dragged && dropTarget);
  const previewItem = previewing
    ? data?.items.find((entry) => entry.id === dragged) ?? catalogue.find((entry) => entry.id === dragged)
    : null;
  const available = catalogue.filter((item) =>
    !used.has(item.id) &&
    (data?.tier_list.kind === "all" || item.kind === data?.tier_list.kind) &&
    !(previewing && item.id === dragged),
  );

  function setItems(items: TierListItem[]) {
    setData((current) => current ? { ...current, items } : current);
  }

  async function placeInTier(item: Item | TierListItem, tier: TierName, targetIndex: number) {
    if (!data) return;
    const current = data.items
      .filter((entry) => entry.tier === tier && entry.id !== item.id)
      .sort((a, b) => a.position - b.position);
    const sourceIndex = data.items
      .filter((entry) => entry.tier === tier)
      .sort((a, b) => a.position - b.position)
      .findIndex((entry) => entry.id === item.id);
    let index = Math.max(0, Math.min(targetIndex, current.length));
    if (sourceIndex >= 0 && sourceIndex < index) index -= 1;
    const ordered = [
      ...current.slice(0, index),
      { ...item, tier, position: index },
      ...current.slice(index),
    ].map((entry, position) => ({ ...entry, position }));
    setData({
      ...data,
      items: [
        ...data.items.filter((entry) => entry.tier !== tier && entry.id !== item.id),
        ...ordered,
      ],
    });
    try {
      await Promise.all(
        ordered.map((entry, position) => api.tierLists.place(id, entry.id, tier, position)),
      );
    } catch (cause) {
      notifyError(cause);
    }
  }

  async function add(item: Item, tier: TierName = poolTier) {
    await placeInTier(item, tier, Number.MAX_SAFE_INTEGER);
  }

  function startDrag(event: React.DragEvent, itemId: string) {
    suppressPoolClick.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    const blank = new Image();
    blank.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    event.dataTransfer.setDragImage(blank, 0, 0);
    setDropTarget(null);
    setDragged(itemId);
  }

  function getDropIndex(event: React.DragEvent, tier: TierName): number {
    const row = event.currentTarget.closest<HTMLElement>(`[data-tier-row="${tier}"]`);
    if (!row) return 0;
    const tiles = Array.from(row.querySelectorAll<HTMLElement>("[data-tier-tile]"));
    let index = 0;
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      if (event.clientX > rect.left + rect.width / 2) index += 1;
    }
    return index;
  }

  function updateDropTarget(event: React.DragEvent, tier: TierName) {
    const tiles = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-tier-tile]"),
    );
    let index = 0;
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      if (event.clientX > rect.left + rect.width / 2) index += 1;
    }
    setDropTarget({ tier, index });

    const edge = 72;
    if (event.clientY < edge) window.scrollBy({ top: -12 });
    else if (event.clientY > window.innerHeight - edge) window.scrollBy({ top: 12 });
  }

  function finishDrag() {
    setDragged(null);
    setDropTarget(null);
    setOverPool(false);
    window.setTimeout(() => { suppressPoolClick.current = false; }, 150);
  }

  async function remove(item: TierListItem) {
    try {
      await api.tierLists.removeItem(id, item.id);
      setItems((data?.items ?? []).filter((entry) => entry.id !== item.id));
    } catch (cause) {
      notifyError(cause);
    }
  }

  async function setVisibility(visibility: "private" | "public") {
    if (!data) return;
    try {
      await api.tierLists.update(id, { title: data.tier_list.title, visibility, kind: data.tier_list.kind });
      setData({ ...data, tier_list: { ...data.tier_list, visibility } });
    } catch (cause) {
      notifyError(cause);
    }
  }

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!data || !renameTitle.trim()) return;
    try {
      await api.tierLists.update(id, {
        title: renameTitle.trim(),
        visibility: data.tier_list.visibility,
        kind: data.tier_list.kind,
      });
      setData({ ...data, tier_list: { ...data.tier_list, title: renameTitle.trim() } });
      setRenaming(false);
    } catch (cause) {
      notifyError(cause);
    }
  }

  async function destroy() {
    try {
      await api.tierLists.remove(id);
      notify({ tone: "success", title: t("tiers.deleted"), text: "", requestId: null });
      setConfirmDelete(false);
      router.push("/tiers");
    } catch (cause) {
      notifyError(cause);
    }
  }

  if (loading) return <main><LoadingScreen /></main>;
  if (!data) return <main><Card title={t("tiers.notFound")}><AppLink href="/tiers">← {t("tiers.title")}</AppLink></Card></main>;

  const publicHref = user?.handle ? `/u/${user.handle}/tier/${data.tier_list.slug}` : null;

  return (
    <main>
      <NotebookTabs />
      <header className={styles.detailHead}>
        <div className={styles.detailTitle}>
          <div className={styles.titleLine}>
            <h1>{data.tier_list.auto ? t(KIND_PLURAL_KEYS[data.tier_list.kind as Exclude<typeof data.tier_list.kind, "all">]) : data.tier_list.title}</h1>
            {!data.tier_list.auto ? (
              <button
                aria-label={t("tiers.rename")}
                className={styles.titleEdit}
                onClick={() => { setRenameTitle(data.tier_list.title); setRenaming(true); }}
                title={t("tiers.rename")}
                type="button"
              >
                <IconPencil size={15} />
              </button>
            ) : null}
          </div>
          <div className={styles.badges}>
            {data.tier_list.auto ? <Badge tone="accent">{t("tiers.auto")}</Badge> : null}
            <Badge tone={data.tier_list.visibility === "public" ? "success" : "neutral"}>
              {data.tier_list.visibility === "public" ? t("tiers.public") : t("tiers.private")}
            </Badge>
            <Badge tone="neutral">
              {data.tier_list.kind === "all" ? t("tiers.allKinds") : t(KIND_PLURAL_KEYS[data.tier_list.kind])}
            </Badge>
          </div>
        </div>
        <div className={styles.detailActions}>
          {data.tier_list.visibility === "public" && publicHref ? (
            <AppLink
              aria-label={t("tiers.openPublic")}
              className={styles.iconAction}
              href={publicHref}
              title={t("tiers.openPublic")}
            >
              <IconGlobe size={16} />
            </AppLink>
          ) : null}
          <button
            aria-label={data.tier_list.visibility === "public" ? t("tiers.private") : t("tiers.public")}
            className={styles.iconAction}
            onClick={() => void setVisibility(data.tier_list.visibility === "public" ? "private" : "public")}
            title={data.tier_list.visibility === "public" ? t("tiers.private") : t("tiers.public")}
            type="button"
          >
            {data.tier_list.visibility === "public" ? <IconLock size={16} /> : <IconGlobe size={16} />}
          </button>
          <button
            aria-label={t("common.delete")}
            className={`${styles.iconAction} ${styles.dangerAction}`}
            onClick={() => setConfirmDelete(true)}
            title={t("common.delete")}
            type="button"
          >
            <IconTrash size={16} />
          </button>
        </div>
      </header>

      <div className={styles.tiers}>
        {TIERS.map((tier) => {
          const items = data.items.filter((item) => item.tier === tier).sort((a, b) => a.position - b.position);
          return (
            <section
              className={`${styles.tierRow} ${dropTarget?.tier === tier ? styles.rowOver : ""}`}
              data-tier-row={tier}
              key={tier}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setDropTarget(null);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                updateDropTarget(event, tier);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const target = dropTarget?.tier === tier
                  ? dropTarget.index
                  : getDropIndex(event, tier);
                const placed = data.items.find((entry) => entry.id === dragged);
                const item = placed ?? catalogue.find((entry) => entry.id === dragged);
                if (item && dragged) void placeInTier(item, tier, target);
                setDragged(null);
                setDropTarget(null);
                setOverPool(false);
                window.setTimeout(() => { suppressPoolClick.current = false; }, 150);
              }}
            >
              <div className={`${styles.tierLabel} ${styles[`tier${tier}`]}`}>{tier}</div>
              <div className={styles.tierItems}>
                {(() => {
                  const sourceIndex = items.findIndex((entry) => entry.id === dragged);
                  let insertIndex = dropTarget?.tier === tier ? dropTarget.index : -1;
                  if (insertIndex >= 0 && sourceIndex >= 0 && sourceIndex < insertIndex) insertIndex -= 1;
                  const visible = previewing ? items.filter((entry) => entry.id !== dragged) : items;
                  const preview = insertIndex >= 0 ? previewItem : null;
                  return (
                    <>
                      {visible.map((item, index) => (
                        <Fragment key={item.id}>
                          {preview && insertIndex === index ? (
                            <div className={styles.dropPreview} title={preview.title}>
                              {preview.cover_key ? <img alt="" draggable={false} src={mediaUrl(preview.cover_key)} /> : <span className={styles.tierPlaceholder}>{preview.title.slice(0, 1)}</span>}
                            </div>
                          ) : null}
                          <div
                            className={`${styles.tierItem} ${dragged === item.id ? styles.dragging : ""}`}
                            data-tier-tile
                            draggable
                            onDragEnd={finishDrag}
                            onDragStart={(event) => startDrag(event, item.id)}
                            title={item.title}
                          >
                            {item.cover_key ? <img alt="" draggable={false} src={mediaUrl(item.cover_key)} /> : <span className={styles.tierPlaceholder}>{item.title.slice(0, 1)}</span>}
                          </div>
                        </Fragment>
                      ))}
                      {preview && insertIndex === visible.length ? (
                        <div className={styles.dropPreview} title={preview.title}>
                          {preview.cover_key ? <img alt="" draggable={false} src={mediaUrl(preview.cover_key)} /> : <span className={styles.tierPlaceholder}>{preview.title.slice(0, 1)}</span>}
                        </div>
                      ) : null}
                    </>
                  );
                })()}

              </div>
            </section>
          );
        })}
      </div>

      <footer className={styles.pool}>
        <div className={styles.poolHead}>
          <strong>{t("tiers.pool")}</strong>
          <span>{overPool ? t("tiers.dropToRemove") : t("tiers.poolHint")}</span>
          <Select
            hideLabel
            label={t("tiers.tier")}
            onChange={(event) => setPoolTier(event.target.value as TierName)}
            value={poolTier}
          >
            {TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
          </Select>
        </div>
        <div
          className={`${styles.poolItems} ${overPool ? styles.poolOver : ""}`}
          onDragLeave={() => setOverPool(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setOverPool(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const placed = data.items.find((entry) => entry.id === dragged);
            if (placed) void remove(placed);
            setDragged(null);
            setDropTarget(null);
            setOverPool(false);
            window.setTimeout(() => { suppressPoolClick.current = false; }, 150);
          }}
        >
          {available.map((item) => (
            <button
              className={styles.poolItem}
              draggable
              key={item.id}
              onClick={() => {
                if (suppressPoolClick.current) return;
                void add(item);
              }}
              onDragEnd={finishDrag}
              onDragStart={(event) => startDrag(event, item.id)}
              title={`${item.title} → ${poolTier}`}
              type="button"
            >
              {item.cover_key ? <img alt="" draggable={false} src={mediaUrl(item.cover_key)} /> : <span>{item.title.slice(0, 1)}</span>}
            </button>
          ))}
          {available.length === 0 ? <span className={styles.poolEmpty}>{t("tiers.noItems")}</span> : null}
        </div>
      </footer>

      <Dialog
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)} size="sm" variant="secondary">{t("common.cancel")}</Button>
            <Button onClick={() => void destroy()} size="sm" variant="danger">{t("common.delete")}</Button>
          </>
        }
        onClose={() => setConfirmDelete(false)}
        open={confirmDelete}
        title={t("tiers.deleteConfirm")}
      >
        <p>{t("tiers.deleteText")}</p>
      </Dialog>

      <Dialog
        footer={<Button onClick={() => setRenaming(false)} size="sm" variant="secondary">{t("common.cancel")}</Button>}
        onClose={() => setRenaming(false)}
        open={renaming}
        title={t("tiers.rename")}
      >
        <form className={styles.form} onSubmit={rename}>
          <Input autoFocus label={t("tiers.name")} maxLength={80} onChange={(event) => setRenameTitle(event.target.value)} required value={renameTitle} />
          <Button disabled={!renameTitle.trim()} type="submit">{t("common.save")}</Button>
        </form>
      </Dialog>
    </main>
  );
}
