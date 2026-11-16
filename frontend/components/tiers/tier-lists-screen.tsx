"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { IconGlobe, IconList, IconLock, IconTrash } from "@/components/icons";
import { NotebookTabs } from "@/components/notebook-tabs";
import { ListSkeleton } from "@/components/skeletons";
import { AppLink } from "@/lib/navigation";
import { Badge, Button, Card, Dialog, Input } from "@/components/ui";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { readViewPreference, saveViewPreference } from "@/lib/view-preference";
import { api } from "@/lib/api";
import { getPageCache, setPageCache } from "@/lib/page-cache";
import { useI18n } from "@/lib/locale-context";
import { KIND_PLURAL_KEYS } from "@/lib/i18n/labels";
import type { TierList, TierListKind } from "@/lib/types";

import styles from "./tiers.module.css";

export function TierListsScreen() {
  const { t, date } = useI18n();
  const [lists, setLists] = useState<TierList[]>(() => getPageCache<TierList[]>("tier-lists") ?? []);
  const [loading, setLoading] = useState(() => getPageCache<TierList[]>("tier-lists") === undefined);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [kind, setKind] = useState<TierListKind>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [view, setView] = useState<ViewMode>(() => readViewPreference("jey:view:tiers"));
  const [filter, setFilter] = useState<"all" | "auto" | "custom">("all");
  const [pendingDelete, setPendingDelete] = useState<TierList | null>(null);

  function load() {
    if (!getPageCache<TierList[]>("tier-lists")) setLoading(true);
    setError(false);
    api.tierLists
      .list()
      .then((response) => {
        setLists(response.tier_lists);
        setPageCache("tier-lists", response.tier_lists);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  useEffect(() => {
    const open = () => setCreating(true);
    window.addEventListener("jey:create-tier", open);
    return () => window.removeEventListener("jey:create-tier", open);
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.tierLists.create({ title: title.trim(), visibility, kind });
      setTitle("");
      setCreating(false);
      load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const visible = lists.filter((list) =>
    filter === "all" || (filter === "auto" ? list.auto : !list.auto),
  );

  async function toggleVisibility(list: TierList) {
    try {
      await api.tierLists.update(list.id, {
        title: list.title,
        visibility: list.visibility === "public" ? "private" : "public",
        kind: list.kind,
      });
      load();
    } catch {
      setError(true);
    }
  }

  async function destroy(list: TierList) {
    try {
      await api.tierLists.remove(list.id);
      setPendingDelete(null);
      load();
    } catch {
      setError(true);
    }
  }

  return (
    <main>
      <NotebookTabs />
      <div className={styles.listToolbar}>
        <ViewSwitch
          onChange={(value) => {
            setView(value);
            saveViewPreference("jey:view:tiers", value);
          }}
          value={view}
        />
        <div aria-label={t("tiers.filter")} className={styles.filterSwitch} role="group">
          {(["all", "auto", "custom"] as const).map((value) => (
            <button
              aria-pressed={filter === value}
              className={`${styles.filterOption} ${filter === value ? styles.filterActive : ""}`}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {value === "all" ? t("tiers.all") : value === "auto" ? t("tiers.autoOnly") : t("tiers.customOnly")}
            </button>
          ))}
        </div>
        <div className={styles.toolbar}>
          <Button onClick={() => setCreating(true)} size="sm">{t("tiers.create")}</Button>
        </div>
      </div>
      {loading ? <Card><ListSkeleton /></Card> : error ? (
        <Card><p className={styles.empty}>{t("error.requestFailed")}</p></Card>
      ) : lists.length === 0 ? (
        <Card><EmptyState text={t("tiers.emptyText")} title={t("tiers.emptyTitle")} /></Card>
      ) : visible.length === 0 ? (
        <Card><p className={styles.empty}>{t("tiers.emptyFiltered")}</p></Card>
      ) : (
        <ul className={`${styles.lists} ${view === "grid" ? styles.grid : ""}`}>
          {visible.map((list) => (
            <li className={styles.listCard} key={list.id}>
              <AppLink className={styles.listLink} href={`/tiers/${list.id}`}>
                <span className={styles.listIcon}><IconList size={18} /></span>
                <span className={styles.listBody}>
                  <strong>{list.auto ? t(KIND_PLURAL_KEYS[list.kind as Exclude<typeof list.kind, "all">]) : list.title}</strong>
                  <span className={styles.listMeta}>
                    <span className={list.visibility === "public" ? styles.publicText : ""}>
                      {list.visibility === "public" ? t("tiers.public") : t("tiers.private")}
                    </span>
                    <span>{t("tiers.items", { count: list.item_count })}</span>
                  </span>
                </span>
                {list.auto ? <Badge tone="accent">{t("tiers.auto")}</Badge> : null}
              </AppLink>
              <span className={styles.listActions}>
                <button
                  aria-label={list.visibility === "public" ? t("tiers.private") : t("tiers.public")}
                  className={styles.action}
                  onClick={() => void toggleVisibility(list)}
                  title={list.visibility === "public" ? t("tiers.private") : t("tiers.public")}
                  type="button"
                >
                  {list.visibility === "public" ? <IconLock size={16} /> : <IconGlobe size={16} />}
                </button>
                {!list.auto ? (
                  <button
                    aria-label={t("common.delete")}
                    className={`${styles.action} ${styles.danger}`}
                    onClick={() => setPendingDelete(list)}
                    title={t("common.delete")}
                    type="button"
                  >
                    <IconTrash size={16} />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)} size="sm" variant="secondary">{t("common.cancel")}</Button>
            <Button onClick={() => { if (pendingDelete) void destroy(pendingDelete); }} size="sm" variant="danger">{t("common.delete")}</Button>
          </>
        }
        onClose={() => setPendingDelete(null)}
        open={pendingDelete !== null}
        title={t("tiers.deleteConfirm")}
      >
        <p>{t("tiers.deleteText")}</p>
      </Dialog>

      <Dialog
        footer={<Button onClick={() => setCreating(false)} size="sm" variant="secondary">{t("common.cancel")}</Button>}
        onClose={() => setCreating(false)}
        open={creating}
        title={t("tiers.new")}
      >
        <form className={styles.form} onSubmit={create}>
          <Input autoFocus label={t("tiers.name")} maxLength={80} onChange={(event) => setTitle(event.target.value)} required value={title} />
          <div className={styles.categoryField}>
            <span className={styles.categoryLabel}>{t("tiers.kind")}</span>
            <div aria-label={t("tiers.kind")} className={styles.categoryGrid} role="group">
              <button
                aria-pressed={kind === "all"}
                className={`${styles.categoryOption} ${kind === "all" ? styles.categoryActive : ""}`}
                onClick={() => setKind("all")}
                type="button"
              >
                {t("tiers.allKinds")}
              </button>
              {(["movie", "tv", "anime", "book", "game", "image", "other"] as TierListKind[]).map((entry) => (
                <button
                  aria-pressed={kind === entry}
                  className={`${styles.categoryOption} ${kind === entry ? styles.categoryActive : ""}`}
                  key={entry}
                  onClick={() => setKind(entry)}
                  type="button"
                >
                  {t(KIND_PLURAL_KEYS[entry as Exclude<TierListKind, "all">])}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.categoryField}>
            <span className={styles.categoryLabel}>{t("tiers.visibility")}</span>
            <div aria-label={t("tiers.visibility")} className={styles.categoryGrid} role="group">
              <button
                aria-pressed={visibility === "private"}
                className={`${styles.categoryOption} ${visibility === "private" ? styles.categoryActive : ""}`}
                onClick={() => setVisibility("private")}
                type="button"
              >
                {t("tiers.private")}
              </button>
              <button
                aria-pressed={visibility === "public"}
                className={`${styles.categoryOption} ${visibility === "public" ? styles.categoryActive : ""}`}
                onClick={() => setVisibility("public")}
                type="button"
              >
                {t("tiers.public")}
              </button>
            </div>
          </div>
          <Button disabled={busy || !title.trim()} type="submit">{t("tiers.create")}</Button>
        </form>
      </Dialog>
    </main>
  );
}
