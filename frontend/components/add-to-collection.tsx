"use client";

import { useEffect, useState } from "react";

import { Button, Card, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Collection } from "@/lib/types";

import styles from "./add-to-collection.module.css";

export function AddToCollection({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.collections
      .list()
      .then((response) => {
        setCollections(response.collections);
        setSelected(response.collections[0]?.id ?? "");
      })
      .catch(() => {});
  }, []);

  if (collections.length === 0) return null;

  async function add() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.collections.addItem(selected, itemId);
      setMessage(t("collections.added"));
      window.dispatchEvent(new Event("jey:collections-changed"));
    } catch {
      setMessage(t("collections.addError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={styles.card} title={t("collections.addTo")}>
      <div className={styles.wrap}>
        <Select
          hideLabel
          label={t("collections.addTo")}
          onChange={(event) => setSelected(event.target.value)}
          value={selected}
        >
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.title}
            </option>
          ))}
        </Select>
        <Button disabled={busy} onClick={() => void add()} size="sm" variant="secondary">
          + {t("collections.add")}
        </Button>
      </div>
      {message ? <p className={styles.message}>{message}</p> : null}
    </Card>
  );
}
