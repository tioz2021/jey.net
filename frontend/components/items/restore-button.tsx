"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

import styles from "./restore-button.module.css";

export function RestoreButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setPending(true);
    setError(null);

    try {
      await api.items.restore(itemId);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={styles.wrapper}>
      <Button size="sm" variant="secondary" loading={pending} onClick={restore}>
        Восстановить
      </Button>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
