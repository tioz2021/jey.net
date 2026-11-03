"use client";

import { useEffect, useState } from "react";

import { Button, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { KIND_KEYS, SORT_KEYS, STATUS_KEYS } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import type { ItemKind, ItemStatus, Sort, TagCount } from "@/lib/types";

import { ActiveFilters } from "./active-filters";
import { useItemsQuery } from "./query-context";
import { SearchBox } from "./search-box";
import styles from "./filters.module.css";

const KINDS = Object.keys(KIND_KEYS) as ItemKind[];
const STATUSES = Object.keys(STATUS_KEYS) as ItemStatus[];
const SORTS = Object.keys(SORT_KEYS) as Sort[];

export function ItemsFilters() {
  const { t } = useI18n();
  const { params: searchParams, update } = useItemsQuery();
  const [tags, setTags] = useState<TagCount[]>([]);

  useEffect(() => {
    let cancelled = false;

    api.tags
      .list()
      .then((response) => {
        if (!cancelled) {
          setTags(response.tags);
        }
      })
      .catch(() => {
        // Tags are a convenience filter; failing to load them is not fatal.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function setParam(key: string, value: string) {
    update((params) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
  }

  const hasFilters =
    searchParams.has("q") ||
    searchParams.has("kind") ||
    searchParams.has("status") ||
    searchParams.has("tag") ||
    searchParams.has("sort");

  return (
    <section className={styles.panel} aria-labelledby="filters-title">
      <h2 className={styles.head} id="filters-title">
        {t("filters.title")}
      </h2>

      <div className={styles.body}>
        <SearchBox />

        <ActiveFilters />

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
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(STATUS_KEYS[value])}
            </option>
          ))}
        </Select>

        <Select
          className={styles.select}
          label={t("filters.tag")}
          value={searchParams.get("tag") ?? ""}
          onChange={(event) => setParam("tag", event.target.value)}
        >
          <option value="">{t("filters.tagAny")}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name}>
              {tag.name} ({tag.item_count})
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

        </div>
      </div>
    </section>
  );
}
