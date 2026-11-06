"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Dialog, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Collection } from "@/lib/types";

import styles from "./collection-manager.module.css";

export function CollectionManager() {
  const { t } = useI18n();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.collections
      .list()
      .then((response) => setCollections(response.collections))
      .catch(() => setError(t("collections.loadError")));
  }

  useEffect(load, [t]);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.collections.create({ title: title.trim(), visibility });
      setTitle("");
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
      <div className={styles.create}>
        <Input
          label={t("collections.newTitle")}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
          placeholder={t("collections.newPlaceholder")}
          value={title}
        />
        <Select
          label={t("collections.visibility")}
          onChange={(event) => setVisibility(event.target.value as "private" | "public")}
          value={visibility}
        >
          <option value="private">{t("collections.private")}</option>
          <option value="public">{t("collections.public")}</option>
        </Select>
        <Button disabled={busy || !title.trim()} onClick={() => void create()}>
          {t("collections.create")}
        </Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {collections.length === 0 ? (
        <p className={styles.empty}>{t("collections.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {collections.map((collection) => (
            <li className={styles.item} key={collection.id}>
              <Link className={styles.link} href={`/collections/${collection.id}`}>
                <span>{collection.title}</span>
                <span className={styles.meta}>
                  {collection.visibility === "public"
                    ? t("collections.public")
                    : t("collections.private")}
                  {" · "}
                  {collection.item_count}
                </span>
              </Link>
              <Button
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
                size="sm"
                variant="ghost"
              >
                {collection.visibility === "public"
                  ? t("collections.makePrivate")
                  : t("collections.makePublic")}
              </Button>
              <Button
                onClick={() => setPendingDelete(collection)}
                size="sm"
                variant="ghost"
              >
                {t("collections.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}

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
