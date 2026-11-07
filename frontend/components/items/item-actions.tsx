"use client";

import { AppLink } from "@/lib/navigation";
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
  const [confirming, setConfirming] = useState(false);

  const { t } = useI18n();

  return (
    <div className={styles.actions}>
      <AppLink className={styles.editLink} href={`/items/${itemId}/edit`}>
        {t("common.edit")}
      </AppLink>
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
