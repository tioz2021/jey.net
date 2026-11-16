"use client";

import { AppLink } from "@/lib/navigation";
import { useEffect, useState } from "react";

import { Button, Dialog, Input } from "@/components/ui";
import { RowsSkeleton } from "@/components/skeletons";
import { IconCollection, IconGlobe, IconLock, IconTrash } from "@/components/icons";
import { api } from "@/lib/api";
import { getPageCache, setPageCache } from "@/lib/page-cache";
import { useI18n } from "@/lib/locale-context";
import type { Collection } from "@/lib/types";

import styles from "./collection-manager.module.css";
import type { ViewMode } from "@/components/view-switch";

export function CollectionManager({ view = "list" }: { view?: ViewMode }) {
  const { t } = useI18n();
  const [collections, setCollections] = useState<Collection[]>(() => getPageCache<Collection[]>("collections") ?? []);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => getPageCache<Collection[]>("collections") === undefined);

  function load() {
    if (!getPageCache<Collection[]>("collections")) setLoading(true);
    api.collections
      .list()
      .then((response) => {
        setCollections(response.collections);
        setPageCache("collections", response.collections);
      })
      .catch(() => setError(t("collections.loadError")))
      .finally(() => setLoading(false));
  }

  useEffect(load, [t]);

  useEffect(() => {
    const open = () => setCreating(true);
    window.addEventListener("jey:create-collection", open);
    return () => window.removeEventListener("jey:create-collection", open);
  }, []);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.collections.create({ title: title.trim(), visibility });
      setTitle("");
      setCreating(false);
      load();
      window.dispatchEvent(new Event("jey:collections-changed"));
    } catch {
      setError(t("collections.createError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.collections.remove(id);
      load();
      window.dispatchEvent(new Event("jey:collections-changed"));
    } catch {
      setError(t("collections.removeError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.mobileCreate}>
        <Button onClick={() => setCreating(true)} size="sm">{t("collections.create")}</Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <div className={styles.skeleton}><RowsSkeleton count={5} /></div>
      ) : collections.length === 0 ? (
        <p className={styles.empty}>{t("collections.empty")}</p>
      ) : (
        <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
          {collections.map((collection) => (
            <li className={styles.item} key={collection.id}>
              <AppLink className={styles.link} href={`/collections/${collection.id}`}>
                <span className={styles.icon}><IconCollection size={18} /></span>
                <span className={styles.body}>
                  <strong>{collection.title}</strong>
                  <span className={styles.meta}>
                    <span className={`${styles.visibility} ${collection.visibility === "public" ? styles.visibilityPublic : ""}`}>
                      {collection.visibility === "public"
                        ? t("collections.public")
                        : t("collections.private")}
                    </span>
                    <span>{collection.item_count}</span>
                  </span>
                </span>
              </AppLink>
              <span className={styles.actions}>
                <button
                  aria-label={collection.visibility === "public"
                    ? t("collections.makePrivate")
                    : t("collections.makePublic")}
                  className={styles.action}
                  onClick={() => {
                    const next = collection.visibility === "public" ? "private" : "public";
                    void api.collections
                      .update(collection.id, { title: collection.title, visibility: next })
                      .then(() => {
                        load();
                        window.dispatchEvent(new Event("jey:collections-changed"));
                      })
                      .catch(() => setError(t("collections.removeError")));
                  }}
                  title={collection.visibility === "public"
                    ? t("collections.makePrivate")
                    : t("collections.makePublic")}
                  type="button"
                >
                  {collection.visibility === "public" ? <IconLock size={16} /> : <IconGlobe size={16} />}
                </button>
                <button
                  aria-label={t("collections.remove")}
                  className={`${styles.action} ${styles.danger}`}
                  onClick={() => setPendingDelete(collection)}
                  title={t("collections.remove")}
                  type="button"
                >
                  <IconTrash size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        footer={<Button onClick={() => setCreating(false)} size="sm" variant="secondary">{t("common.cancel")}</Button>}
        onClose={() => setCreating(false)}
        open={creating}
        title={t("collections.newTitle")}
      >
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <Input
            autoFocus
            label={t("collections.name")}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("collections.newPlaceholder")}
            required
            value={title}
          />
          <div className={styles.visibilityField}>
            <span className={styles.visibilityLabel}>{t("collections.visibility")}</span>
            <div aria-label={t("collections.visibility")} className={styles.visibilityGrid} role="group">
              <button
                aria-pressed={visibility === "private"}
                className={`${styles.visibilityOption} ${visibility === "private" ? styles.visibilityActive : ""}`}
                onClick={() => setVisibility("private")}
                type="button"
              >
                {t("collections.private")}
              </button>
              <button
                aria-pressed={visibility === "public"}
                className={`${styles.visibilityOption} ${visibility === "public" ? styles.visibilityActive : ""}`}
                onClick={() => setVisibility("public")}
                type="button"
              >
                {t("collections.public")}
              </button>
            </div>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Button disabled={busy || !title.trim()} type="submit">{t("collections.create")}</Button>
        </form>
      </Dialog>

      <Dialog
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)} variant="secondary">
              {t("common.cancel")}
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                if (!pendingDelete) return;
                void remove(pendingDelete.id).then(() => setPendingDelete(null));
              }}
              variant="danger"
            >
              {t("collections.deleteConfirm")}
            </Button>
          </>
        }
        onClose={() => setPendingDelete(null)}
        open={pendingDelete !== null}
        title={t("collections.deleteTitle")}
      >
        <p>{t("collections.deleteText")}</p>
      </Dialog>
    </div>
  );
}
