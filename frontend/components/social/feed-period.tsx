"use client";

import { Select } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

export type FeedPeriodValue = "24h" | "week" | "month" | "all";

export function FeedPeriod({
  value,
  onChange,
}: {
  value: FeedPeriodValue;
  onChange: (value: FeedPeriodValue) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="feed-period">
      <Select
        hideLabel
        label={t("feed.period")}
        onChange={(event) => onChange(event.target.value as FeedPeriodValue)}
        value={value}
      >
        <option value="24h">{t("feed.period24h")}</option>
        <option value="week">{t("feed.periodWeek")}</option>
        <option value="month">{t("feed.periodMonth")}</option>
        <option value="all">{t("feed.periodAll")}</option>
      </Select>
    </div>
  );
}
