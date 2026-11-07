"use client";

import { useAppRouter } from "@/lib/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";

export function RemoveFromCollection({
  collectionId,
  itemId,
}: {
  collectionId: string;
  itemId: string;
}) {
  const router = useAppRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.collections.removeItem(collectionId, itemId);
      window.dispatchEvent(new Event("jey:collections-changed"));
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setConfirming(true)} size="sm" variant="secondary">
        {t("collections.removeItem")}
      </Button>
      <Dialog
        footer={
          <>
            <Button onClick={() => setConfirming(false)} variant="secondary">
              {t("common.cancel")}
            </Button>
            <Button loading={busy} onClick={() => void remove()} variant="danger">
              {t("collections.removeItemConfirm")}
            </Button>
          </>
        }
        onClose={() => setConfirming(false)}
        open={confirming}
        title={t("collections.removeItemTitle")}
      >
        <p>{t("collections.removeItemText")}</p>
      </Dialog>
    </>
  );
}
