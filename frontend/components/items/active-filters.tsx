"use client";

import { KIND_KEYS, SORT_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import type { ItemKind, ItemStatus, Sort } from "@/lib/types";

import { useItemsQuery } from "./query-context";
import styles from "./active-filters.module.css";

interface Chip {
  key: string;
  label: string;
}

const monthFormat = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    return value;
  }

  return monthFormat.format(new Date(year, month - 1, 1));
}

function buildChips(
  params: URLSearchParams,
  t: ReturnType<typeof useI18n>["t"],
): Chip[] {
  const chips: Chip[] = [];

  const query = params.get("q")?.trim();
  if (query) {
    chips.push({ key: "q", label: t("active.search", { q: query }) });
  }

  const kind = params.get("kind");
  if (kind) {
    chips.push({
      key: "kind",
      label: KIND_KEYS[kind as ItemKind]
        ? t(KIND_KEYS[kind as ItemKind])
        : kind,
    });
  }

  const status = params.get("status");
  if (status) {
    chips.push({
      key: "status",
      label: STATUS_KEYS[status as ItemStatus]
        ? t(STATUS_KEYS[status as ItemStatus])
        : status,
    });
  }

  const month = params.get("month");
  if (month) {
    chips.push({
      key: "month",
      label: t("active.month", { month: monthLabel(month) }),
    });
  }

  const sort = params.get("sort");
  if (sort && sort !== "created_desc") {
    chips.push({
      key: "sort",
      label: SORT_KEYS[sort as Sort]
        ? t("active.sort", { sort: t(SORT_KEYS[sort as Sort]) })
        : sort,
    });
  }

  return chips;
}

/** Shows every active condition with a button to drop just that one. */
export function ActiveFilters() {
  const { t } = useI18n();
  const { params, update } = useItemsQuery();
  const chips = buildChips(params, t);

  if (chips.length === 0) {
    return null;
  }

  function remove(key: string) {
    update((next) => next.delete(key));
  }

  return (
    <ul className={styles.chips} aria-label={t("filters.title")}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            aria-label={`Убрать фильтр ${chip.label}`}
            className={styles.chip}
            onClick={() => remove(chip.key)}
            type="button"
          >
            <span className={styles.label}>{chip.label}</span>
            <span aria-hidden="true" className={styles.cross}>
              ×
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
