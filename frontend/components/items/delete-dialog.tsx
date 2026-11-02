"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/components/toasts";



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
  const { notifyError } = useToast();
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);

    try {
      await api.items.remove(itemId);
      router.push("/items");
      router.refresh();
    } catch (cause) {
      notifyError(cause);
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Удалить запись?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button variant="danger" loading={pending} onClick={remove}>
            Удалить
          </Button>
        </>
      }
    >
      <p>
        «{title}» переедет в корзину: запись можно будет вернуть, она не
        удаляется навсегда.
      </p>
    </Dialog>
  );
}
