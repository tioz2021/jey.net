"use client";

import { useState } from "react";

import { Button, Input, Select } from "@/components/ui";
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

export function ItemsFilters({
  onSelect,
  selectionMode = false,
}: {
  onSelect?: () => void;
  selectionMode?: boolean;
}) {
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
    "year_from",
    "year_to",
    "rating_min",
    "rating_max",
  ].filter((key) => searchParams.has(key)).length +
    (searchParams.has("sort") && searchParams.get("sort") !== "created_desc"
      ? 1
      : 0);
  const hasFilters = activeCount > 0;

  return (
    <section
      aria-label={t("filters.title")}
      className={`${styles.panel} ${open ? styles.open : ""}`}
    >
      <h2 className={styles.head} id="filters-title">
        {t("filters.title")}
      </h2>

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

      <div className={styles.body} id="filters-body">
        <SearchBox className={styles.desktopSearch} />

        <div className={styles.row}>
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

        <Select
          className={styles.select}
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

        {selectedKind ? (
          <div className={styles.rangeRow}>
            <Input
              className={styles.rangeInput}
              label={t("filters.yearFrom")}
              min={1800}
              onChange={(event) => setParam("year_from", event.target.value)}
              placeholder="1800"
              type="number"
              value={searchParams.get("year_from") ?? ""}
            />
            <Input
              className={styles.rangeInput}
              label={t("filters.yearTo")}
              max={2100}
              min={1800}
              onChange={(event) => setParam("year_to", event.target.value)}
              placeholder="2100"
              type="number"
              value={searchParams.get("year_to") ?? ""}
            />
            <Input
              className={styles.rangeInput}
              label={t("filters.ratingMin")}
              max={10}
              min={1}
              onChange={(event) => setParam("rating_min", event.target.value)}
              placeholder="1"
              type="number"
              value={searchParams.get("rating_min") ?? ""}
            />
            <Input
              className={styles.rangeInput}
              label={t("filters.ratingMax")}
              max={10}
              min={1}
              onChange={(event) => setParam("rating_max", event.target.value)}
              placeholder="10"
              type="number"
              value={searchParams.get("rating_max") ?? ""}
            />
          </div>
        ) : null}

        <div className={styles.foot}>
          <Button
            disabled={!hasFilters}
            variant="ghost"
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
          {onSelect && !selectionMode ? (
            <Button
              className={styles.select}
              onClick={onSelect}
              size="sm"
              variant="ghost"
            >
              {t("bulk.selectModeLong")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={styles.chips}>
        <ActiveFilters />
      </div>
    </section>
  );
}
