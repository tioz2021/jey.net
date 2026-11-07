"use client";

import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { RatingStars } from "@/components/items/rating-stars";
import { KIND_KEYS } from "@/lib/i18n/labels";
import type { Item } from "@/lib/types";

import styles from "./trash-list.module.css";

export function TrashList({ items, onChanged }: { items: Item[]; onChanged: () => void }) {
  const { t, date } = useI18n();
  const { notify, notifyError } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);

  async function restore(item: Item) {
    setPendingId(item.id);

    try {
      await api.items.restore(item.id);
      onChanged();
      notify({
        tone: "success",
        title: t("trash.restored"),
        text: t("trash.restoredText", { title: item.title }),
        requestId: null,
      });
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPendingId(null);
    }
  }

  async function purge(item: Item) {
    setPendingId(item.id);

    try {
      await api.items.purge(item.id);
      setConfirming(null);
      onChanged();
      notify({
        tone: "success",
        title: t("trash.purged"),
        text: t("trash.purgedText", { title: item.title }),
        requestId: null,
      });
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => (
          <li className={styles.row} key={item.id}>
            <div className={styles.info}>
              <p className={styles.title}>{item.title}</p>
              <p className={styles.meta}>
                {t(KIND_KEYS[item.kind])}
                {item.deleted_at
                  ? ` · ${t("trash.deletedOn", {
                      date: date(item.deleted_at, { dateStyle: "long" }),
                    })}`
                  : null}
              </p>
              {item.rating ? (
                <div className={styles.rating}>
                  <RatingStars
                    compact
                    label={t("item.ratingOf", { rating: item.rating })}
                    value={item.rating}
                  />
                </div>
              ) : null}
            </div>

            <div className={styles.actions}>
              <Button
                loading={pendingId === item.id}
                size="sm"
                variant="secondary"
                onClick={() => restore(item)}
              >
                {t("trash.restore")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(item)}>
                {t("trash.deleteForever")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={confirming !== null}
        title={
          confirming
            ? t("trash.confirmTitle", { title: confirming.title })
            : ""
        }
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={pendingId === confirming?.id}
              onClick={() => confirming && purge(confirming)}
            >
              {t("trash.deleteForever")}
            </Button>
          </>
        }
      >
        <p className={styles.hint}>{t("trash.confirmText")}</p>
      </Dialog>
    </>
  );
}
