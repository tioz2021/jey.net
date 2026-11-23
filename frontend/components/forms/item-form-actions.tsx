"use client";

import { Button, Dialog } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

import styles from "./item-form.module.css";

export function ItemFormActions({
  itemId,
  submitting,
  clearOpen,
  onClearOpen,
  onClearClose,
  onClear,
  onCancel,
}: {
  itemId?: string;
  submitting: boolean;
  clearOpen: boolean;
  onClearOpen: () => void;
  onClearClose: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className={styles.actions}>
        <div className={styles.primaryActions}>
          <Button type="submit" loading={submitting}>
            {itemId ? t("form.update") : t("form.save")}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            {t("form.cancel")}
          </Button>
        </div>
        <Button
          className={styles.clearAction}
          disabled={submitting}
          onClick={onClearOpen}
          variant="secondary"
        >
          {t("form.clear")}
        </Button>
      </div>

      <Dialog
        footer={
          <>
            <Button onClick={onClearClose} variant="secondary">
              {t("form.clearCancel")}
            </Button>
            <Button onClick={onClear} variant="danger">
              {t("form.clearConfirm")}
            </Button>
          </>
        }
        onClose={onClearClose}
        open={clearOpen}
        title={t("form.clearTitle")}
      >
        <p>{t("form.clearText")}</p>
      </Dialog>
    </>
  );
}
