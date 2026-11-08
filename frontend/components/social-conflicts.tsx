"use client";

import { useEffect, useState } from "react";

import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toasts";
import { api } from "@/lib/api";
import type { SocialConflict } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";

import styles from "./social-conflicts.module.css";

function versionTitle(conflict: SocialConflict, side: "incoming" | "stored") {
  const value = conflict[side];
  return conflict.entity === "collection"
    ? String(value.title ?? "—")
    : String(value.body ?? "—");
}

export function SocialConflicts() {
  const { t, date } = useI18n();
  const { notifyError } = useToast();
  const [conflicts, setConflicts] = useState<SocialConflict[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.social
      .conflicts()
      .then((response) => {
        if (!cancelled) setConflicts(response.conflicts);
      })
      .catch((error) => {
        if (!cancelled) {
          setConflicts([]);
          notifyError(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [notifyError]);

  async function resolve(conflict: SocialConflict, keep: "incoming" | "stored") {
    setBusy(conflict.conflict_id);
    try {
      await api.social.resolve(conflict.conflict_id, keep);
      setConflicts((current) =>
        current?.filter((entry) => entry.conflict_id !== conflict.conflict_id) ?? [],
      );
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title={t("conflicts.title")}>
      <p className={styles.hint}>{t("conflicts.text")}</p>
      {conflicts === null ? (
        <p className={styles.muted}>{t("conflicts.loading")}</p>
      ) : conflicts.length === 0 ? (
        <p className={styles.muted}>{t("conflicts.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {conflicts.map((conflict) => (
            <li className={styles.item} key={conflict.conflict_id}>
              <div className={styles.meta}>
                <strong>
                  {conflict.entity === "collection"
                    ? t("conflicts.collection")
                    : t("conflicts.comment")}
                </strong>
                <time>{date(conflict.created_at, { dateStyle: "short" })}</time>
              </div>
              <div className={styles.versions}>
                <div>
                  <span>{t("conflicts.incoming")}</span>
                  <p>{versionTitle(conflict, "incoming")}</p>
                </div>
                <div>
                  <span>{t("conflicts.stored")}</span>
                  <p>{versionTitle(conflict, "stored")}</p>
                </div>
              </div>
              <div className={styles.actions}>
                <Button
                  disabled={busy !== null}
                  loading={busy === conflict.conflict_id}
                  onClick={() => void resolve(conflict, "stored")}
                  size="sm"
                  variant="secondary"
                >
                  {t("conflicts.keepStored")}
                </Button>
                <Button
                  disabled={busy !== null}
                  onClick={() => void resolve(conflict, "incoming")}
                  size="sm"
                >
                  {t("conflicts.keepIncoming")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
