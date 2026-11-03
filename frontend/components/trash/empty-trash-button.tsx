"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";

export function EmptyTrashButton({ count }: { count: number }) {
  const router = useRouter();
  const { t } = useI18n();
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
        title: t("trash.emptied"),
        text: t("trash.emptiedText", { count: result.purged }),
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
        {t("trash.emptyTrash")}
      </Button>

      <Dialog
        open={open}
        title={t("trash.emptyConfirmTitle")}
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
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={pending} onClick={empty}>
              {t("trash.emptyConfirm")}
            </Button>
          </>
        }
      >
        <p>{t("trash.emptyConfirmText", { count })}</p>
      </Dialog>
    </>
  );
}
