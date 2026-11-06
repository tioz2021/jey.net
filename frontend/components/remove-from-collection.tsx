"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";

export function RemoveFromCollection({
  collectionId,
  itemId,
}: {
  collectionId: string;
  itemId: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.collections.removeItem(collectionId, itemId);
          window.dispatchEvent(new Event("jey:collections-changed"));
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      size="sm"
      variant="ghost"
    >
      {t("collections.removeItem")}
    </Button>
  );
}
