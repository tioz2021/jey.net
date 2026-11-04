"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/lib/locale-context";

import { useItemsQuery } from "./query-context";
import styles from "./item-list.module.css";

interface SavedFilter {
  id: string;
  name: string;
  query: string;
}

const STORAGE_KEY = "jey.saved-filters";

function readSaved(): SavedFilter[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is SavedFilter =>
            typeof item?.id === "string" &&
            typeof item?.name === "string" &&
            typeof item?.query === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/** Local, private saved filters; they never leave the browser. */
export function SavedFilters() {
  const { t } = useI18n();
  const { params, update } = useItemsQuery();
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [name, setName] = useState("");
  const query = params.toString();
  const hasFilters = ["kind", "status", "q", "year_from", "year_to", "rating_min", "rating_max", "month"].some(
    (key) => params.has(key),
  );

  useEffect(() => {
    setSaved(readSaved());
  }, []);

  function persist(next: SavedFilter[]) {
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function save() {
    const label = name.trim();
    if (!label || !query) return;
    persist([
      ...saved.filter((item) => item.query !== query),
      { id: crypto.randomUUID(), name: label, query },
    ]);
    setName("");
  }

  function apply(filter: SavedFilter) {
    update((next) => {
      for (const key of [...next.keys()]) next.delete(key);
      new URLSearchParams(filter.query).forEach((value, key) =>
        next.set(key, value),
      );
    });
  }

  return (
    <section className={styles.saved} aria-label={t("saved.title")}>
      <span className={styles.savedTitle}>{t("saved.title")}</span>
      <div className={styles.savedList}>
        {saved.map((filter) => (
          <span className={styles.savedChip} key={filter.id}>
            <button onClick={() => apply(filter)} type="button">
              {filter.name}
            </button>
            <button
              aria-label={t("saved.delete", { name: filter.name })}
              className={styles.savedDelete}
              onClick={() =>
                persist(saved.filter((item) => item.id !== filter.id))
              }
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        {hasFilters ? (
          <span className={styles.savedSave}>
            <input
              aria-label={t("saved.name")}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
              }}
              placeholder={t("saved.name")}
              value={name}
            />
            <button disabled={!name.trim()} onClick={save} type="button">
              {t("saved.save")}
            </button>
          </span>
        ) : null}
      </div>
    </section>
  );
}
