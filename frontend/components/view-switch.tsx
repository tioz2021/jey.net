"use client";

import { IconList, IconOther } from "@/components/icons";
import { useI18n } from "@/lib/locale-context";

export type ViewMode = "list" | "grid";

export function ViewSwitch({
  onChange,
  value,
}: {
  onChange: (value: ViewMode) => void;
  value: ViewMode;
}) {
  const { t } = useI18n();
  return (
    <div aria-label={t("view.label")} className="view-switch" role="group">
      <button
        aria-label={t("view.list")}
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
        type="button"
      >
        <IconList size={16} />
      </button>
      <button
        aria-label={t("view.grid")}
        aria-pressed={value === "grid"}
        onClick={() => onChange("grid")}
        type="button"
      >
        <IconOther size={16} />
      </button>
    </div>
  );
}
