"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TagActions } from "@/components/items/tag-actions";
import { useI18n } from "@/lib/locale-context";
import { plural } from "@/lib/i18n";
import type { TagCount } from "@/lib/types";

import styles from "./tags-browser.module.css";

type SortMode = "count" | "name";

export function TagsBrowser({ tags }: { tags: TagCount[] }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("count");

  const maxCount = Math.max(...tags.map((tag) => tag.item_count), 1);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? tags.filter((tag) => tag.name.toLowerCase().includes(needle))
      : tags;

    return [...filtered].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, locale)
        : b.item_count - a.item_count || a.name.localeCompare(b.name, locale),
    );
  }, [locale, query, sort, tags]);

  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span className="visually-hidden">{t("tags.search")}</span>
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("tags.search")}
            type="search"
            value={query}
          />
        </label>

        <label className={styles.sort}>
          <span>{t("tags.sort")}</span>
          <select
            onChange={(event) => setSort(event.target.value as SortMode)}
            value={sort}
          >
            <option value="count">{t("tags.sortCount")}</option>
            <option value="name">{t("tags.sortName")}</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>{t("tags.noMatch")}</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((tag) => (
            <li className={styles.row} key={tag.id}>
              <div className={styles.tagMain}>
                <Link
                  className={styles.name}
                  href={`/items?tag=${encodeURIComponent(tag.name)}`}
                >
                  {tag.name}
                </Link>
                <span className={styles.count}>
                  {t("tags.records", {
                    count: tag.item_count,
                    forms: plural(locale, tag.item_count, {
                      one: t("tags.record.one"),
                      few: t("tags.record.few"),
                      many: t("tags.record.many"),
                    }),
                  })}
                </span>
              </div>

              <div aria-hidden="true" className={styles.frequency}>
                <span
                  className={styles.bar}
                  style={{ width: `${(tag.item_count / maxCount) * 100}%` }}
                />
              </div>

              <TagActions tag={tag} tags={tags} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
