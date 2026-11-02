"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { KIND_LABELS } from "@/lib/labels";
import type { Item } from "@/lib/types";

import styles from "./trash-list.module.css";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" });

export function TrashList({ items }: { items: Item[] }) {
  const router = useRouter();
  const { notify, notifyError } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);

  async function restore(item: Item) {
    setPendingId(item.id);

    try {
      await api.items.restore(item.id);
      router.refresh();
      notify({
        tone: "success",
        title: "Запись восстановлена",
        text: `«${item.title}» снова в каталоге.`,
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
      router.refresh();
      notify({
        tone: "success",
        title: "Запись удалена навсегда",
        text: `«${item.title}» больше не восстановить.`,
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
                {KIND_LABELS[item.kind]}
                {item.deleted_at
                  ? ` · удалено ${dateFormat.format(new Date(item.deleted_at))}`
                  : null}
              </p>
            </div>

            <div className={styles.actions}>
              <Button
                loading={pendingId === item.id}
                size="sm"
                variant="secondary"
                onClick={() => restore(item)}
              >
                Восстановить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(item)}>
                Удалить навсегда
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={confirming !== null}
        title={confirming ? `Удалить «${confirming.title}» навсегда?` : ""}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={pendingId === confirming?.id}
              onClick={() => confirming && purge(confirming)}
            >
              Удалить навсегда
            </Button>
          </>
        }
      >
        <p className={styles.hint}>
          Запись и её обложка исчезнут без возможности восстановления.
        </p>
      </Dialog>
    </>
  );
}
