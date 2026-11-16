"use client";

import { useState } from "react";

import { Button, Dialog, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import { useToast } from "@/components/toasts";

import styles from "./report-button.module.css";

export function ReportButton({
  targetType,
  targetId,
  ownerId,
  open: controlledOpen,
  onClose,
}: {
  targetType: "item" | "comment" | "profile" | "chat_message";
  targetId: string;
  ownerId?: string;
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useUser();
  const { notify } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const close = () => {
    if (controlled) onClose?.();
    else setInternalOpen(false);
  };
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || (ownerId && ownerId === user.id)) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.reports.create({
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details.trim() || undefined,
      });
      close();
      setDetails("");
      notify({
        tone: "success",
        title: t("report.sent"),
        text: t("report.sentText"),
        requestId: null,
      });
    } catch {
      setError(t("report.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!controlled ? (
        <button className={styles.trigger} onClick={() => setInternalOpen(true)} type="button">
          {t("report.action")}
        </button>
      ) : null}
      <Dialog
        footer={
          <>
            <Button
              className={styles.cancel}
              onClick={close}
              size="sm"
              variant="secondary"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className={styles.submit}
              loading={busy}
              onClick={() => void submit()}
              size="sm"
            >
              {t("report.submit")}
            </Button>
          </>
        }
        onClose={close}
        open={open}
        title={t("report.title")}
      >
        <div className={styles.form}>
          <p className={styles.intro}>{t("report.intro")}</p>
          <p className={styles.target}>
            {t(`report.target.${targetType}`)}
          </p>
          <Select
            label={t("report.reason")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="spam">{t("report.reason.spam")}</option>
            <option value="abuse">{t("report.reason.abuse")}</option>
            <option value="spoilers">{t("report.reason.spoilers")}</option>
            <option value="other">{t("report.reason.other")}</option>
          </Select>
          <Textarea
            label={t("report.details")}
            maxLength={1000}
            onChange={(event) => setDetails(event.target.value)}
            rows={4}
            value={details}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </Dialog>
    </>
  );
}
