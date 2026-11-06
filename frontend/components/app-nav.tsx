"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  IconAnime,
  IconBook,
  IconFilm,
  IconGame,
  IconList,
  IconTrash,
  IconTv,
} from "@/components/icons";
import { api } from "@/lib/api";
import type { Stats } from "@/lib/types";

import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";

import { CollectionsSidebar } from "./collections-sidebar";
import { FollowingSidebar } from "./following-sidebar";
import { ITEMS_QUERY_EVENT } from "./items/query-context";
import styles from "./app-nav.module.css";

const KINDS: Array<{
  kind: string | null;
  labelKey: TranslationKey;
  Icon: typeof IconList;
}> = [
  { kind: null, labelKey: "nav.all", Icon: IconList },
  { kind: "movie", labelKey: "nav.movies", Icon: IconFilm },
  { kind: "tv", labelKey: "nav.series", Icon: IconTv },
  { kind: "anime", labelKey: "nav.anime", Icon: IconAnime },
  { kind: "book", labelKey: "nav.books", Icon: IconBook },
  { kind: "game", labelKey: "nav.games", Icon: IconGame },
];

const VISIBLE_KINDS = ["movie", "tv", "anime", "book", "game"] as const;

function kindFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("kind");
}

export function AppNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const [activeKind, setActiveKind] = useState<string | null>(params.get("kind"));
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  const onItems = pathname === "/items";

  useEffect(() => {
    setActiveKind(params.get("kind"));
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    api.stats
      .get()
      .then((stats: Stats) => {
        if (!cancelled) {
          setCounts(stats.by_kind);
        }
      })
      .catch(() => {
        // Counts are decorative; the catalogue must work if stats fail.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Filters change the URL without an App Router navigation, so the active
  // item has to follow our own event as well as back/forward.
  useEffect(() => {
    const sync = () => setActiveKind(kindFromLocation());

    window.addEventListener(ITEMS_QUERY_EVENT, sync);
    window.addEventListener("popstate", sync);

    return () => {
      window.removeEventListener(ITEMS_QUERY_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return (
    <div className={styles.column}>
    <aside className={styles.nav} aria-label="Типы записей">
      <p className={styles.head}>{t("nav.types")}</p>
      <div className={styles.body}>
        {KINDS.map(({ kind, labelKey, Icon }) => {
        const active =
          onItems && (kind === null ? !activeKind : activeKind === kind);
        const href = kind ? `/items?kind=${kind}` : "/items";

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`${styles.link} ${active ? styles.active : ""}`}
            href={href}
            key={labelKey}
            onClick={(event) => {
              // Already on the catalogue: swap the filter in place instead of
              // navigating, so the page keeps its scroll position.
              if (!onItems) {
                return;
              }

              event.preventDefault();

              const next = new URLSearchParams(window.location.search);
              if (kind) {
                next.set("kind", kind);
              } else {
                next.delete("kind");
              }

              const query = next.toString();
              window.history.replaceState(
                null,
                "",
                query ? `/items?${query}` : "/items",
              );
              window.dispatchEvent(new Event(ITEMS_QUERY_EVENT));
            }}
          >
            <Icon size={14} />
            <span className={styles.label}>{t(labelKey)}</span>
            <span className={styles.count}>
              {kind === null
                ? VISIBLE_KINDS.reduce(
                    (total, key) => total + (counts[key] ?? 0),
                    0,
                  )
                : (counts[kind] ?? 0)}
            </span>
            </Link>
          );
        })}

        <Link
          aria-current={pathname === "/trash" ? "page" : undefined}
          className={`${styles.link} ${styles.trashLink} ${
            pathname === "/trash" ? styles.active : ""
          }`}
          href="/trash"
        >
          <IconTrash size={14} />
          {t("nav.trash")}
        </Link>
      </div>
    </aside>
    <div id="items-filter-slot" />
    <CollectionsSidebar />
    <FollowingSidebar />
    </div>
  );
}
