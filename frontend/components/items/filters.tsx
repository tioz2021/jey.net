"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { KIND_LABELS, SORT_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { ItemKind, ItemStatus, Sort, TagCount } from "@/lib/types";

import styles from "./filters.module.css";

const KINDS = Object.entries(KIND_LABELS) as [ItemKind, string][];
const STATUSES = Object.entries(STATUS_LABELS) as [ItemStatus, string][];
const SORTS = Object.entries(SORT_LABELS) as [Sort, string][];

export function ItemsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    const query = params.toString();
    router.replace(query ? `/items?${query}` : "/items", { scroll: false });
  }

  const hasFilters =
    searchParams.has("kind") ||
    searchParams.has("status") ||
    searchParams.has("tag") ||
    searchParams.has("sort");

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <Select
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

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace("/items", { scroll: false })}
        >
          Сбросить фильтры
        </Button>
      ) : null}
    </div>
  );
}
