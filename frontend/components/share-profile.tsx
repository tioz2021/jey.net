"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/toasts";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

import styles from "./share-profile.module.css";

/**
 * The share link for a public profile.
 *
 * The account comes from the context, so toggling "Публичный профиль" and
 * saving updates this block without a page reload.
 */
export function ShareProfile() {
  const { user } = useUser();
  const { t } = useI18n();
  const { notify } = useToast();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!user) {
    return null;
  }

  const userRef = user.handle || user.id;
  const link = origin ? `${origin}/u/${userRef}` : `/u/${userRef}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${userRef}`);
      notify({
        tone: "success",
        title: t("settings.copied"),
        text: t("settings.shareOpen"),
        requestId: null,
      });
    } catch {
      notify({
        tone: "error",
        title: t("settings.copyFailed"),
        text: t("settings.copyFailedText"),
        requestId: null,
      });
    }
  }

  return (
    <Card title={t("settings.share")}>

      {user.is_public ? (
        <>
          <p className={styles.text}>{t("settings.shareBody")}</p>

          <div className={styles.row}>
            <input
              aria-label={t("settings.share")}
              className={styles.input}
              onFocus={(event) => event.target.select()}
              readOnly
              value={link}
            />
            <Button onClick={copyLink} variant="secondary">
              {t("settings.copy")}
            </Button>
          </div>
        </>
      ) : (
        <p className={styles.text}>{t("settings.shareClosed")}</p>
      )}
    </Card>
  );
}
