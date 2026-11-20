"use client";

import { Select } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

export type FeedSortValue = "new" | "popular" | "rating";

export function FeedSort({
  value,
  onChange,
  includePopular = true,
}: {
  value: FeedSortValue;
  onChange: (value: FeedSortValue) => void;
  includePopular?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="feed-sort">
      <Select
        hideLabel
        label={t("feed.sort")}
        onChange={(event) => onChange(event.target.value as FeedSortValue)}
        value={value}
      >
        <option value="new">{t("feed.sortNew")}</option>
        {includePopular ? <option value="popular">{t("feed.sortPopular")}</option> : null}
        <option value="rating">{t("feed.sortRating")}</option>
      </Select>
    </div>
  );
}
