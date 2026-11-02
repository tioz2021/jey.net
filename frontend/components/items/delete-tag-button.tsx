"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export function DeleteTagButton({
  tagId,
  name,
}: {
  tagId: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function remove() {
    setPending(true);
    setError(null);

    try {
      await api.tags.remove(tagId);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
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
        {error ? (
          <p role="alert" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
