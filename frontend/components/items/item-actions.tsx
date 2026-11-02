"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

import { DeleteDialog } from "./delete-dialog";
import styles from "./item-actions.module.css";

export function ItemActions({
  itemId,
  title,
}: {
  itemId: string;
  title: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.actions}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => router.push(`/items/${itemId}/edit`)}
      >
        Редактировать
      </Button>
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Удалить
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
