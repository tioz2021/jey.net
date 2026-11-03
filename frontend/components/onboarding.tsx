"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

import styles from "./onboarding.module.css";

const STORAGE_KEY = "jey-onboarding-dismissed";

/**
 * First-run guidance for an empty catalogue. Hidden after the first record or
 * after the user dismisses it (remembered in localStorage).
 */
export function Onboarding({ fallback }: { fallback?: ReactNode }) {
  const { t } = useI18n();
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
    <Card title={t("onboarding.title")}>
      <div className={styles.body}>
        <p className={styles.lead}>{t("onboarding.lead")}</p>

        <ol className={styles.steps}>
          <li>{t("onboarding.step1")}</li>
          <li>{t("onboarding.step2")}</li>
          <li>{t("onboarding.step3")}</li>
        </ol>

        <div className={styles.actions}>
          <Link className={styles.cta} href="/items/new">
            {t("onboarding.add")}
          </Link>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t("onboarding.dismiss")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
