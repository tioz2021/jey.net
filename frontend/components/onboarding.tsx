"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button, Card } from "@/components/ui";

import styles from "./onboarding.module.css";

const STORAGE_KEY = "jey-onboarding-dismissed";

/**
 * First-run guidance for an empty catalogue. Hidden after the first record or
 * after the user dismisses it (remembered in localStorage).
 */
export function Onboarding({ fallback }: { fallback?: ReactNode }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (dismissed === null) {
    return null;
  }

  if (dismissed) {
    return fallback ?? null;
  }

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  return (
    <Card title="С чего начать">
      <div className={styles.body}>
        <p className={styles.lead}>
          Записывайте то, что посмотрели, прочитали или сохранили — и не теряйте
          впечатления.
        </p>

        <ol className={styles.steps}>
          <li>
            Добавьте первую запись: фильм, книгу, картинку или что-то своё.
          </li>
          <li>
            Поставьте оценку и оставьте заметку — они пригодятся вам самим.
          </li>
          <li>
            Если захотите делиться — включите публичный профиль в настройках.
          </li>
        </ol>

        <div className={styles.actions}>
          <Link className={styles.cta} href="/items/new">
            Добавить первую запись
          </Link>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Понятно, скрыть
          </Button>
        </div>
      </div>
    </Card>
  );
}
