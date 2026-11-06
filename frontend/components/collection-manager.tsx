"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Collection } from "@/lib/types";

import styles from "./collection-manager.module.css";

export function CollectionManager() {
  const { t } = useI18n();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [title, setTitle] = useState("");
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
      await api.collections.create({ title: title.trim() });
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
                <span className={styles.count}>{collection.item_count}</span>
              </Link>
              <Button onClick={() => void remove(collection.id)} size="sm" variant="ghost">
                {t("collections.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
