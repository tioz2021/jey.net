"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/components/toasts";

export function DeleteTagButton({
  tagId,
  name,
}: {
  tagId: string;
  name: string;
}) {
  const router = useRouter();
  const { notifyError } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function close() {
    setOpen(false);
  }

  async function remove() {
    setPending(true);

    try {
      await api.tags.remove(tagId);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Удалить
      </Button>

      <Dialog
        open={open}
        title={`Удалить тег «${name}»?`}
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
        <p>Тег исчезнет у всех записей. Сами записи останутся на месте.</p>
      </Dialog>
    </>
  );
}
