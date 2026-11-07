"use client";

import { useAppRouter } from "@/lib/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
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
  const router = useAppRouter();
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

  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      title={t("item.deleteTitle")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" loading={pending} onClick={remove}>
            {t("common.delete")}
          </Button>
        </>
      }
    >
      <p>{t("item.deleteText", { title })}</p>
    </Dialog>
  );
}
