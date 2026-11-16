"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { EmptyState } from "@/components/empty-state";
import { NotebookTabs } from "@/components/notebook-tabs";
import { LoadingScreen } from "@/components/loading-screen";
import { AppLink } from "@/lib/navigation";
import { Button, Card, Dialog, Input, Select, Badge } from "@/components/ui";
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

const TIERS: TierName[] = ["S", "A", "B", "C", "D"];

export function TierDetailScreen() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const router = useAppRouter();
  const { notify, notifyError } = useToast();
  const { user } = useUser();
  const source = useCatalogueSource();
  const [data, setData] = useState<TierListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addTier, setAddTier] = useState<TierName>("S");
  const [catalogue, setCatalogue] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.tierLists
      .detail(id)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!addOpen) return;
    void source.list({ limit: 100 }).then((response) => setCatalogue(response.items));
  }, [addOpen, source]);

  const used = useMemo(() => new Set(data?.items.map((item) => item.id)), [data]);
  const available = catalogue.filter((item) =>
    !used.has(item.id) &&
    (data?.tier_list.kind === "all" || item.kind === data?.tier_list.kind) &&
    item.title.toLowerCase().includes(query.toLowerCase()),
  );

  function setItems(items: TierListItem[]) {
    setData((current) => current ? { ...current, items } : current);
  }

  async function move(item: TierListItem, tier: TierName) {
    const position = (data?.items ?? []).filter((entry) => entry.tier === tier && entry.id !== item.id).length;
    setItems((data?.items ?? []).map((entry) => entry.id === item.id ? { ...entry, tier, position } : entry));
    try {
      await api.tierLists.place(id, item.id, tier, position);
    } catch (cause) {
      notifyError(cause);
    }
  }

  async function add(item: Item) {
    setBusy(true);
    try {
      await api.tierLists.place(id, item.id, addTier, (data?.items ?? []).filter((entry) => entry.tier === addTier).length);
      setData((current) => current ? {
        ...current,
        items: [...current.items, { ...item, tier: addTier, position: (current.items ?? []).filter((entry) => entry.tier === addTier).length }],
      } : current);
      setAddOpen(false);
    } catch (cause) {
      notifyError(cause);
    } finally {
      setBusy(false);
    }
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
                const item = data.items.find((entry) => entry.id === dragged);
                if (item) void move(item, tier);
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
                    onDragStart={() => setDragged(item.id)}
                    onDragEnd={() => setDragged(null)}
                    title={item.title}
                  >
                    {item.cover_key ? <img alt="" src={mediaUrl(item.cover_key)} /> : <span className={styles.tierPlaceholder}>{item.title.slice(0, 1)}</span>}
                    <span>{item.title}</span>
                    <button aria-label={t("common.delete")} onClick={() => void remove(item)} type="button">×</button>
                  </div>
                ))}
                <button
                  className={styles.addItem}
                  onClick={() => { setAddTier(tier); setAddOpen(true); }}
                  type="button"
                >
                  + {t("tiers.add")}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <Dialog
        footer={<Button onClick={() => setAddOpen(false)} size="sm" variant="secondary">{t("common.cancel")}</Button>}
        onClose={() => setAddOpen(false)}
        open={addOpen}
        title={t("tiers.add")}
      >
        <div className={styles.picker}>
          <Select label={t("tiers.tier")} onChange={(event) => setAddTier(event.target.value as TierName)} value={addTier}>
            {TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
          </Select>
          <Input label={t("tiers.search")} onChange={(event) => setQuery(event.target.value)} placeholder={t("tiers.search")} value={query} />
          <ul className={styles.pickerList}>
            {available.map((item) => (
              <li key={item.id}>
                <button disabled={busy} onClick={() => void add(item)} type="button">
                  {item.cover_key ? <img alt="" src={mediaUrl(item.cover_key)} /> : null}
                  <span>{item.title}</span>
                  <span>+</span>
                </button>
              </li>
            ))}
          </ul>
          {available.length === 0 ? <EmptyState text={t("tiers.noItems")} title={t("tiers.noItems")} /> : null}
        </div>
      </Dialog>
    </main>
  );
}
