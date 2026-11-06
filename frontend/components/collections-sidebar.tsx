"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { Collection } from "@/lib/types";

import styles from "./collections-sidebar.module.css";

export function CollectionsSidebar() {
  const { t } = useI18n();
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.collections
        .list()
        .then((response) => {
          if (!cancelled) setCollections(response.collections);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("jey:collections-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("jey:collections-changed", load);
    };
  }, []);

  return (
    <section className={styles.panel} aria-label={t("collections.title")}>
      <div className={styles.head}>
        <span>{t("collections.title")}</span>
        <span className={styles.actions}>
          <Link href="/collections">{t("collections.allShort")}</Link>
          <Link href="/collections">＋</Link>
        </span>
      </div>
      {collections.length === 0 ? (
        <p className={styles.empty}>{t("collections.emptySidebar")}</p>
      ) : (
        <ul className={styles.list}>
          {collections.slice(0, 30).map((collection) => (
            <li key={collection.id}>
              <Link className={styles.item} href={`/collections/${collection.id}`}>
                <span>{collection.title}</span>
                <span className={styles.count}>{collection.item_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
