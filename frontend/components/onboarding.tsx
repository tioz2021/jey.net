"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./onboarding.module.css";

const STORAGE_KEY = "jey-onboarding-dismissed";

/**
 * First-run guidance for an empty catalogue. Hidden after the first record or
 * after the user dismisses it (remembered in localStorage).
 */
export function Onboarding({ fallback }: { fallback?: ReactNode }) {
  const { t } = useI18n();
  const { user } = useUser();
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

        <div className={styles.stepGrid}>
          <Link className={styles.stepCard} href="/items/new">
            <span className={styles.stepNumber}>1</span>
            <span>
              <strong>{t("onboarding.add")}</strong>
              <span className={styles.stepText}>{t("onboarding.step1")}</span>
            </span>
          </Link>
          <Link className={styles.stepCard} href="/people">
            <span className={styles.stepNumber}>2</span>
            <span>
              <strong>{t("onboarding.people")}</strong>
              <span className={styles.stepText}>{t("onboarding.step2")}</span>
            </span>
          </Link>
          <Link className={styles.stepCard} href="/collections">
            <span className={styles.stepNumber}>3</span>
            <span>
              <strong>{t("onboarding.collections")}</strong>
              <span className={styles.stepText}>{t("onboarding.step4")}</span>
            </span>
          </Link>
          <Link className={styles.stepCard} href="/recommendations">
            <span className={styles.stepNumber}>4</span>
            <span>
              <strong>{t("onboarding.recommendations")}</strong>
              <span className={styles.stepText}>{t("onboarding.step3")}</span>
            </span>
          </Link>
        </div>

        <div className={styles.privacy}>
          <p>
            {user?.is_public
              ? t("onboarding.privacyPublic")
              : t("onboarding.privacyPrivate")}
          </p>
          <Link href="/settings#privacy">{t("onboarding.privacyLink")}</Link>
        </div>

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
