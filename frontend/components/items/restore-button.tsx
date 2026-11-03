"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import { api } from "@/lib/api";
import { useToast } from "@/components/toasts";

import styles from "./restore-button.module.css";

export function RestoreButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { notifyError } = useToast();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);

  async function restore() {
    setPending(true);

    try {
      await api.items.restore(itemId);
      router.refresh();
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={styles.wrapper}>
      <Button size="sm" variant="secondary" loading={pending} onClick={restore}>
        {t("common.restore")}
      </Button>
    </span>
  );
}
