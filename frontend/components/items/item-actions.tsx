"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

import styles from "./item-actions.module.css";

export function ItemActions({
  itemId,
  title,
}: {
  itemId: string;
  title: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setConfirming(false);
    setError(null);
  }

  async function remove() {
    setPending(true);
    setError(null);

    try {
      await api.items.remove(itemId);
      router.push("/items");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <div className={styles.actions}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => router.push(`/items/${itemId}/edit`)}
      >
        Редактировать
      </Button>
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Удалить
      </Button>

      <Dialog
        open={confirming}
        title="Удалить запись?"
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Отмена
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Удалить
            </Button>
          </>
        }
      >
        <p className={styles.text}>
          «{title}» переедет в корзину: запись можно будет вернуть, она не
          удаляется навсегда.
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
