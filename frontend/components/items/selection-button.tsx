"use client";

import { Button } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

/** Secondary action in the catalogue header; the list owns selection mode. */
export function SelectionButton() {
  const { t } = useI18n();
  return (
    <Button
      onClick={() => window.dispatchEvent(new Event("jey:items-selection"))}
      size="sm"
      variant="secondary"
    >
      {t("bulk.selectModeLong")}
    </Button>
  );
}
