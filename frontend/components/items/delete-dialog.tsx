"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

import styles from "./delete-dialog.module.css";

export function DeleteDialog({
  itemId,
  title,
  open,
  onClose,
}: {
  itemId: string;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
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
    <Dialog
      open={open}
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
  );
}
