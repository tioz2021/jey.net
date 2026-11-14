"use client";

import { ActiveFilters } from "./active-filters";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import { useItemsQuery } from "./query-context";

export function ActiveFilterBar() {
  const { t } = useI18n();
  const { params, update } = useItemsQuery();
  const hasFilters =
    ["q", "status", "month"].some((key) => params.has(key)) ||
    (params.has("sort") && params.get("sort") !== "created_desc");

  if (!hasFilters) return null;

  return (
    <div className="active-filter-bar">
      <ActiveFilters compact />
      <Button
        onClick={() =>
          update((next) => {
            for (const key of [...next.keys()]) {
              if (key !== "kind") next.delete(key);
            }
          })
        }
        size="sm"
        variant="ghost"
      >
        {t("filters.reset")}
      </Button>
    </div>
  );
}
