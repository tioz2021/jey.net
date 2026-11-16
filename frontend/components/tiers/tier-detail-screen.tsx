"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const dropped = useRef(false);

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

  function startDrag(itemId: string) {
    dropped.current = false;
    setDragged(itemId);
  }

  function finishDrag() {
    if (!dropped.current) {
      const placed = data?.items.find((entry) => entry.id === dragged);
      if (placed) void remove(placed);
    }
    setDragged(null);
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
              key={tier}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                dropped.current = true;
                const target = data.items
                  .filter((entry) => entry.tier === tier)
                  .sort((a, b) => a.position - b.position).length;
                const placed = data.items.find((entry) => entry.id === dragged);
                const item = placed ?? catalogue.find((entry) => entry.id === dragged);
                if (item) void placeInTier(item, tier, target);
                setDragged(null);
              }}
            >
              <div className={`${styles.tierLabel} ${styles[`tier${tier}`]}`}>{tier}</div>
              <div className={styles.tierItems}>
                {items.map((item) => (
                  <div
                    className={styles.tierItem}
                    draggable
                    key={item.id}
                    onDragEnd={finishDrag}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={() => startDrag(item.id)}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      dropped.current = true;
                      const targetIndex = items.findIndex((entry) => entry.id === item.id);
                      const placed = data.items.find((entry) => entry.id === dragged);
                      const source = placed ?? catalogue.find((entry) => entry.id === dragged);
                      if (source) void placeInTier(source, tier, targetIndex);
                      setDragged(null);
                    }}
                    title={item.title}
                  >
                    {item.cover_key ? <img alt="" src={mediaUrl(item.cover_key)} /> : <span className={styles.tierPlaceholder}>{item.title.slice(0, 1)}</span>}
                  </div>
                ))}

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
          className={styles.poolItems}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            dropped.current = true;
            const placed = data.items.find((entry) => entry.id === dragged);
            if (placed) void remove(placed);
            setDragged(null);
          }}
        >
          {available.map((item) => (
            <button
              className={styles.poolItem}
              draggable
              key={item.id}
              onClick={() => void add(item)}
              onDragEnd={finishDrag}
              onDragStart={() => startDrag(item.id)}
              title={`${item.title} → ${poolTier}`}
              type="button"
            >
              {item.cover_key ? <img alt="" src={mediaUrl(item.cover_key)} /> : <span>{item.title.slice(0, 1)}</span>}
            </button>
          ))}
          {available.length === 0 ? <span className={styles.poolEmpty}>{t("tiers.noItems")}</span> : null}
        </div>
      </footer>
    </main>
  );
}
