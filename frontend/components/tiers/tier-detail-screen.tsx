"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { NotebookTabs } from "@/components/notebook-tabs";
import { LoadingScreen } from "@/components/loading-screen";
import { AppLink } from "@/lib/navigation";
import { Button, Card, Select, Badge } from "@/components/ui";
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
  const [dropTarget, setDropTarget] = useState<{ tier: TierName; index: number } | null>(null);
  const [overPool, setOverPool] = useState(false);
  const dropped = useRef(false);
  const canceled = useRef(false);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragged) canceled.current = true;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragged]);

  const used = useMemo(() => new Set(data?.items.map((item) => item.id)), [data]);
  const available = catalogue.filter((item) =>
    !used.has(item.id) &&
    (data?.tier_list.kind === "all" || item.kind === data?.tier_list.kind),
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
    dropped.current = false;
    canceled.current = false;
    suppressPoolClick.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
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
  }

  function finishDrag() {
    if (!dropped.current && !canceled.current) {
      const placed = data?.items.find((entry) => entry.id === dragged);
      if (placed) void remove(placed);
    }
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

  async function destroy() {
    if (!window.confirm(t("tiers.deleteConfirm"))) return;
    try {
      await api.tierLists.remove(id);
      notify({ tone: "success", title: t("tiers.deleted"), text: "", requestId: null });
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
        <AppLink href="/tiers">← {t("tiers.title")}</AppLink>
        <div>
          <h1>{data.tier_list.title}</h1>
          <Badge tone={data.tier_list.visibility === "public" ? "success" : "neutral"}>
            {data.tier_list.visibility === "public" ? t("tiers.public") : t("tiers.private")}
          </Badge>
          <Badge tone="neutral">
            {data.tier_list.kind === "all" ? t("tiers.allKinds") : t(KIND_PLURAL_KEYS[data.tier_list.kind])}
          </Badge>
        </div>
        <div className={styles.detailActions}>
          {data.tier_list.visibility === "public" && publicHref ? (
            <AppLink className={styles.publicLink} href={publicHref}>{t("tiers.openPublic")} ↗</AppLink>
          ) : null}
          <Select
            hideLabel
            label={t("tiers.visibility")}
            onChange={(event) => void setVisibility(event.target.value as "private" | "public")}
            value={data.tier_list.visibility}
          >
            <option value="private">{t("tiers.private")}</option>
            <option value="public">{t("tiers.public")}</option>
          </Select>
          <Button onClick={() => void destroy()} size="sm" variant="secondary">{t("common.delete")}</Button>
        </div>
      </header>

      <div className={styles.tiers}>
        {TIERS.map((tier) => {
          const items = data.items.filter((item) => item.tier === tier).sort((a, b) => a.position - b.position);
          return (
            <section
              className={styles.tierRow}
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
                dropped.current = true;
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
                  let gapIndex = dropTarget?.tier === tier ? dropTarget.index : -1;
                  if (gapIndex >= 0 && sourceIndex >= 0 && sourceIndex < gapIndex) gapIndex -= 1;
                  return (
                    <>
                      {items.map((item, index) => (
                        <Fragment key={item.id}>
                          {gapIndex === index ? <span className={styles.dropGap} /> : null}
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
                      {gapIndex === items.length ? <span className={styles.dropGap} /> : null}
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
          <span>{t("tiers.poolHint")}</span>
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
            dropped.current = true;
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
    </main>
  );
}
