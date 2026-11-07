"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, Card, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Collection } from "@/lib/types";

import styles from "./add-to-collection.module.css";

export function AddToCollection({ itemId, compact = false }: { itemId: string; compact?: boolean }) {
  const { t } = useI18n();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.collections
      .forItem(itemId)
      .then((response) => {
        setCollections(response.collections);
        const firstFree = response.collections.find((collection) => !collection.contains);
        setSelected((firstFree ?? response.collections[0])?.id ?? "");
      })
      .catch(() => {});
  }, [itemId]);

  const existing = useMemo(
    () => collections.filter((collection) => collection.contains),
    [collections],
  );
  const selectedCollection = collections.find((collection) => collection.id === selected);

  if (collections.length === 0) return null;

  async function add() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.collections.addItem(selected, itemId);
      setCollections((current) =>
        current.map((collection) =>
          collection.id === selected ? { ...collection, contains: true } : collection,
        ),
      );
      setMessage(t("collections.added"));
      window.dispatchEvent(new Event("jey:collections-changed"));
    } catch {
      setMessage(t("collections.addError"));
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className={styles.compact}>
        <Select hideLabel label={t("collections.addTo")} onChange={(event) => setSelected(event.target.value)} value={selected}>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>{collection.contains ? "✓ " : ""}{collection.title}</option>
          ))}
        </Select>
        <Button disabled={busy || !selected || Boolean(selectedCollection?.contains)} onClick={() => void add()} size="sm" variant="secondary">
          {selectedCollection?.contains ? "✓" : "+"}
        </Button>
      </div>
    );
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
              {collection.contains ? "✓ " : ""}
              {collection.title}
            </option>
          ))}
        </Select>
        <Button
          disabled={busy || !selected || Boolean(selectedCollection?.contains)}
          onClick={() => void add()}
          size="sm"
          variant="primary"
        >
          {selectedCollection?.contains
            ? t("collections.alreadyAdded")
            : `+ ${t("collections.add")}`}
        </Button>
      </div>
      {existing.length > 0 ? (
        <div className={styles.existing}>
          <span>{t("collections.inCollections")}</span>
          {existing.map((collection) => (
            <span className={styles.chip} key={collection.id}>
              {collection.title}
            </span>
          ))}
        </div>
      ) : null}
      {message ? <p className={styles.message}>{message}</p> : null}
    </Card>
  );
}
