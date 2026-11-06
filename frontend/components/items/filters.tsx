"use client";

import { useState } from "react";

import { Button, Select } from "@/components/ui";
import {
  KIND_KEYS,
  SORT_KEYS,
  STATUS_KEYS,
  STATUSES_BY_KIND,
  statusKey,
} from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import type { ItemKind, ItemStatus, Sort } from "@/lib/types";

import { ActiveFilters } from "./active-filters";
import { useItemsQuery } from "./query-context";
import { SearchBox } from "./search-box";
import styles from "./filters.module.css";

const KINDS: ItemKind[] = ["movie", "tv", "book", "game", "anime"];
const STATUSES = Object.keys(STATUS_KEYS) as ItemStatus[];
const SORTS = Object.keys(SORT_KEYS) as Sort[];

export function ItemsFilters({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { params: searchParams, update } = useItemsQuery();
  const [open, setOpen] = useState(false);

  function setParam(key: string, value: string) {
    update((params) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
  }

  const selectedKind = searchParams.get("kind") as ItemKind | null;
  const statuses = selectedKind
    ? STATUSES_BY_KIND[selectedKind]
    : STATUSES;

  const activeCount = [
    "q",
    "kind",
    "status",
    "month",
  ].filter((key) => searchParams.has(key)).length +
    (searchParams.has("sort") && searchParams.get("sort") !== "created_desc"
      ? 1
      : 0);
  const hasFilters = activeCount > 0;

  return (
    <section
      aria-label={t("filters.title")}
      className={`${styles.panel} ${open ? styles.open : ""} ${compact ? styles.compact : ""}`}
    >
      <h2 className={styles.head} id="filters-title">
        {t("filters.title")}
      </h2>

      {compact ? null : (
      <button
        aria-controls="filters-body"
        aria-expanded={open}
        className={styles.toggle}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>
          {activeCount > 0
            ? t("filters.titleCount", { count: activeCount })
            : t("filters.title")}
        </span>
        <svg
          aria-hidden="true"
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          fill="none"
          height="10"
          viewBox="0 0 24 24"
          width="10"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>
      )}

      <div className={styles.body} id="filters-body">
        <SearchBox className={styles.desktopSearch} />

        <div className={styles.row}>
        {compact ? null : (
          <Select
            className={styles.select}
            label={t("filters.kind")}
            value={searchParams.get("kind") ?? ""}
            onChange={(event) => setParam("kind", event.target.value)}
          >
            <option value="">{t("filters.kindAny")}</option>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(KIND_KEYS[value])}
              </option>
            ))}
          </Select>
        )}

        <Select
          className={styles.select}
          hideLabel={compact}
          label={t("filters.status")}
          value={searchParams.get("status") ?? ""}
          onChange={(event) => setParam("status", event.target.value)}
        >
          <option value="">{t("filters.statusAny")}</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {t(statusKey(selectedKind, value))}
            </option>
          ))}
        </Select>

        <Select
          className={styles.select}
          hideLabel={compact}
          label={t("filters.sort")}
          value={searchParams.get("sort") ?? "created_desc"}
          onChange={(event) => setParam("sort", event.target.value)}
        >
          {SORTS.map((value) => (
            <option key={value} value={value}>
              {t(SORT_KEYS[value])}
            </option>
          ))}
        </Select>
        </div>

        {hasFilters ? (
          <div className={styles.foot}>
            <Button
              variant={compact ? "secondary" : "ghost"}
              size="sm"
              onClick={() =>
                update((params) => {
                  for (const key of [...params.keys()]) {
                    params.delete(key);
                  }
                })
              }
            >
              {t("filters.reset")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className={styles.chips}>
        <ActiveFilters compact={compact} />
      </div>
    </section>
  );
}
