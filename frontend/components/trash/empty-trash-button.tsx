"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";

export function EmptyTrashButton({ count }: { count: number }) {
  const router = useRouter();
  const { notify, notifyError } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function empty() {
    setPending(true);

    try {
      const result = await api.items.emptyTrash();
      setOpen(false);
      router.refresh();
      notify({
        tone: "success",
        title: "Корзина очищена",
        text: `Удалено записей: ${result.purged}.`,
        requestId: null,
      });
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Очистить корзину
      </Button>

      <Dialog
        open={open}
        title="Очистить корзину?"
        onClose={() => {
          if (!pending) {
            setOpen(false);
          }
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
            <Button variant="danger" loading={pending} onClick={empty}>
              Очистить
            </Button>
          </>
        }
      >
        <p>
          Безвозвратно удалятся все записи из корзины: {count}. Отменить это
          будет нельзя.
        </p>
      </Dialog>
    </>
  );
}
