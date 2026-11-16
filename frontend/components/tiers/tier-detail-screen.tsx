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
import { ratingForTier } from "@/lib/tier-rating";
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
  const [movingItem, setMovingItem] = useState<TierListItem | null>(null);
  const [dropTarget, setDropTarget] = useState<{ tier: TierName; index: number } | null>(null);
  const [overPool, setOverPool] = useState(false);
  const suppressPoolClick = useRef(false);
  const suppressTileClick = useRef(false);
  const pointerFrame = useRef<number | null>(null);
  const pointerCleanup = useRef<(() => void) | null>(null);
  const pointerDrag = useRef<{
    item: Item | TierListItem;
    ghost: HTMLElement;
    width: number;
    height: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

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

  useEffect(() => () => pointerCleanup.current?.(), []);

  const used = useMemo(() => new Set(data?.items.map((item) => item.id)), [data]);
  const previewing = Boolean(dragged && dropTarget);
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
    const autoRating = data.tier_list.auto ? ratingForTier(tier) : null;
    const previousTier = "tier" in item ? item.tier : null;
    const previousRating = item.rating;
    let changedRating: number | null = null;
    if (autoRating !== null && previousTier !== tier && item.rating !== autoRating) {
      try {
        await api.items.update(item.id, { rating: autoRating });
        item = { ...item, rating: autoRating };
        changedRating = autoRating;
      } catch (cause) {
        notifyError(cause);
        return;
      }
    }
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
      if (changedRating !== null && previousRating !== null && previousRating !== changedRating) {
        notify({
          tone: "info",
          title: t("tiers.ratingChanged", { rating: changedRating }),
          text: "",
          requestId: null,
          tag: "tier-rating",
          action: {
            label: t("common.undo"),
            onClick: () => void undoRating(item.id, previousRating),
          },
        });
      }
    } catch (cause) {
      notifyError(cause);
    }
  }

  async function undoRating(itemId: string, rating: number) {
    try {
      await api.items.update(itemId, { rating });
      setData(await api.tierLists.detail(id));
    } catch (cause) {
      notifyError(cause);
    }
  }

  async function add(item: Item, tier: TierName = poolTier) {
    await placeInTier(item, tier, Number.MAX_SAFE_INTEGER);
  }

  function pointerTarget(x: number, y: number): { tier: TierName; index: number } | { pool: true } | null {
    const pool = document.querySelector<HTMLElement>("[data-tier-pool]");
    if (pool) {
      const rect = pool.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { pool: true };
      }
    }
    for (const row of document.querySelectorAll<HTMLElement>("[data-tier-row]")) {
      const rect = row.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom || x < rect.left || x > rect.right) continue;
      let index = 0;
      for (const tile of row.querySelectorAll<HTMLElement>("[data-tier-tile]")) {
        const tileRect = tile.getBoundingClientRect();
        if (x > tileRect.left + tileRect.width / 2) index += 1;
      }
      return { tier: row.dataset.tierRow as TierName, index };
    }
    return null;
  }

  function cleanupPointer() {
    const state = pointerDrag.current;
    if (state) state.ghost.remove();
    pointerDrag.current = null;
    if (pointerFrame.current !== null) {
      window.cancelAnimationFrame(pointerFrame.current);
      pointerFrame.current = null;
    }
    pointerCleanup.current?.();
    pointerCleanup.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  function beginPointerDrag(event: React.PointerEvent, item: Item | TierListItem) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const source = event.currentTarget as HTMLElement;
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      "z-index:9999",
      "pointer-events:none",
      "opacity:0",
      "border-radius:8px",
      "box-shadow:0 14px 34px rgb(0 0 0 / 28%)",
      "transform:translate3d(0,0,0) rotate(2deg)",
    ].join(";");
    document.body.appendChild(ghost);
    const state = {
      item,
      ghost,
      width: rect.width,
      height: rect.height,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    pointerDrag.current = state;

    const move = (moveEvent: PointerEvent) => {
      const current = pointerDrag.current;
      if (!current) return;
      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;
      if (!current.active) {
        if (Math.hypot(dx, dy) < 5) return;
        current.active = true;
        setDragged(current.item.id);
        current.ghost.style.opacity = "0.95";
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      moveEvent.preventDefault();
      current.ghost.style.transform = `translate3d(${moveEvent.clientX - current.width / 2}px, ${moveEvent.clientY - current.height - 10}px, 0) rotate(2deg)`;

      if (pointerFrame.current !== null) return;
      const x = moveEvent.clientX;
      const y = moveEvent.clientY;
      pointerFrame.current = window.requestAnimationFrame(() => {
        pointerFrame.current = null;
        const target = pointerTarget(x, y);
        if (target && "pool" in target) {
          setOverPool(true);
          setDropTarget(null);
        } else if (target) {
          setOverPool(false);
          setDropTarget((previous) =>
            previous?.tier === target.tier && previous.index === target.index
              ? previous
              : target,
          );
        } else {
          setOverPool(false);
          setDropTarget(null);
        }
        const edge = 72;
        if (y < edge) window.scrollBy({ top: -14 });
        else if (y > window.innerHeight - edge) window.scrollBy({ top: 14 });
      });
    };

    const finish = (upEvent: PointerEvent) => {
      const current = pointerDrag.current;
      if (current?.active) {
        suppressPoolClick.current = true;
        suppressTileClick.current = true;
        const target = pointerTarget(upEvent.clientX, upEvent.clientY);
        if (target && "pool" in target) {
          if ("tier" in current.item) void remove(current.item);
        } else if (target) {
          void placeInTier(current.item, target.tier, target.index);
        }
        window.setTimeout(() => {
          suppressPoolClick.current = false;
          suppressTileClick.current = false;
        }, 180);
      }
      cleanupPointer();
      setDragged(null);
      setDropTarget(null);
      setOverPool(false);
    };

    const cancel = () => {
      cleanupPointer();
      setDragged(null);
      setDropTarget(null);
      setOverPool(false);
    };
    const key = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    window.addEventListener("keydown", key);
    pointerCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }

  async function remove(item: TierListItem) {
    if (data?.tier_list.auto) {
      notify({ tone: "info", title: t("tiers.autoManaged"), text: "", requestId: null });
      return;
    }
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
          {!data.tier_list.auto ? (
            <button
              aria-label={t("common.delete")}
              className={`${styles.iconAction} ${styles.dangerAction}`}
              onClick={() => setConfirmDelete(true)}
              title={t("common.delete")}
              type="button"
            >
              <IconTrash size={16} />
            </button>
          ) : null}
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
            >
              <div className={`${styles.tierLabel} ${styles[`tier${tier}`]}`}>{tier}</div>
              <div className={styles.tierItems}>
                {(() => {
                  const insertIndex = dropTarget?.tier === tier ? dropTarget.index : -1;
                  const visible = items;
                  return (
                    <>
                      {visible.map((item, index) => (
                        <Fragment key={item.id}>
                          {insertIndex === index ? <span className={styles.dropGap} /> : null}
                          <div
                            className={`${styles.tierItem} ${dragged === item.id ? styles.dragging : ""}`}
                            data-tier-tile
                            onClick={() => {
                              if (suppressTileClick.current) return;
                              setMovingItem(item);
                            }}
                            onPointerDown={(event) => beginPointerDrag(event, item)}
                            title={item.title}
                          >
                            {item.cover_key ? <img alt="" draggable={false} src={mediaUrl(item.cover_key)} /> : <span className={styles.tierPlaceholder}>{item.title.slice(0, 1)}</span>}
                          </div>
                        </Fragment>
                      ))}
                      {insertIndex === visible.length ? <span className={styles.dropGap} /> : null}
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
          data-tier-pool
        >
          {available.map((item) => (
            <button
              className={`${styles.poolItem} ${dragged === item.id ? styles.dragging : ""}`}
              key={item.id}
              onClick={() => {
                if (suppressPoolClick.current) return;
                void add(item);
              }}
              onPointerDown={(event) => beginPointerDrag(event, item)}
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
        footer={<Button onClick={() => setMovingItem(null)} size="sm" variant="secondary">{t("common.cancel")}</Button>}
        onClose={() => setMovingItem(null)}
        open={movingItem !== null}
        title={t("tiers.moveTitle")}
      >
        <div className={styles.moveDialog}>
          {movingItem ? <p>{movingItem.title}</p> : null}
          <div className={styles.moveGrid}>
            {TIERS.map((tier) => (
              <button
                className={`${styles.moveOption} ${styles[`tier${tier}`]}`}
                key={tier}
                onClick={() => {
                  const item = movingItem;
                  setMovingItem(null);
                  if (item) void placeInTier(item, tier, data.items.filter((entry) => entry.tier === tier).length);
                }}
                type="button"
              >
                {tier}
              </button>
            ))}
          </div>
          {data.tier_list.auto ? <p className={styles.moveHint}>{t("tiers.autoMoveHint")}</p> : null}
        </div>
      </Dialog>

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
