"use client";

import { useEffect, useState } from "react";

import { Button, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { KIND_LABELS, SORT_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { ItemKind, ItemStatus, Sort, TagCount } from "@/lib/types";

import { ActiveFilters } from "./active-filters";
import { useItemsQuery } from "./query-context";
import { SearchBox } from "./search-box";
import styles from "./filters.module.css";

const KINDS = Object.entries(KIND_LABELS) as [ItemKind, string][];
const STATUSES = Object.entries(STATUS_LABELS) as [ItemStatus, string][];
const SORTS = Object.entries(SORT_LABELS) as [Sort, string][];

export function ItemsFilters() {
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
        Фильтры
      </h2>

      <div className={styles.body}>
        <SearchBox />

        <ActiveFilters />

        <div className={styles.row}>
        <Select
          className={styles.select}
          label="Тип"
          value={searchParams.get("kind") ?? ""}
          onChange={(event) => setParam("kind", event.target.value)}
        >
          <option value="">Все типы</option>
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          className={styles.select}
          label="Статус"
          value={searchParams.get("status") ?? ""}
          onChange={(event) => setParam("status", event.target.value)}
        >
          <option value="">Любой статус</option>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          className={styles.select}
          label="Тег"
          value={searchParams.get("tag") ?? ""}
          onChange={(event) => setParam("tag", event.target.value)}
        >
          <option value="">Все теги</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.name}>
              {tag.name} ({tag.item_count})
            </option>
          ))}
        </Select>

        <Select
          className={styles.select}
          label="Сортировка"
          value={searchParams.get("sort") ?? "created_desc"}
          onChange={(event) => setParam("sort", event.target.value)}
        >
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
            Сбросить фильтры
          </Button>

        </div>
      </div>
    </section>
  );
}
