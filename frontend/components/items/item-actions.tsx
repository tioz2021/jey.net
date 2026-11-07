"use client";

import { useAppRouter } from "@/lib/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

import { DeleteDialog } from "./delete-dialog";
import styles from "./item-actions.module.css";

export function ItemActions({
  itemId,
  title,
}: {
  itemId: string;
  title: string;
}) {
  const router = useAppRouter();
  const [confirming, setConfirming] = useState(false);

  const { t } = useI18n();

  return (
    <div className={styles.actions}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => router.push(`/items/${itemId}/edit`)}
      >
        {t("common.edit")}
      </Button>
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        {t("common.delete")}
      </Button>

      <DeleteDialog
        itemId={itemId}
        title={title}
        open={confirming}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
