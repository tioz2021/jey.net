"use client";

import { AppLink } from "@/lib/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { Item } from "@/lib/types";

import { DeleteDialog } from "./delete-dialog";
import { ShareItemDialog } from "./share-item-dialog";
import styles from "./item-actions.module.css";

export function ItemActions({ item }: { item: Item }) {
  const [confirming, setConfirming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { t } = useI18n();

  return (
    <div className={styles.actions}>
      <AppLink className={styles.editLink} href={`/items/${item.id}/edit`}>
        {t("common.edit")}
      </AppLink>
      <Button onClick={() => setSharing(true)} size="sm" variant="secondary">
        {t("share.action")}
      </Button>
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        {t("common.delete")}
      </Button>

      <DeleteDialog
        itemId={item.id}
        title={item.title}
        open={confirming}
        onClose={() => setConfirming(false)}
      />
      <ShareItemDialog
        item={item}
        onClose={() => setSharing(false)}
        open={sharing}
      />
    </div>
  );
}
