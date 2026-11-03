"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  IconBook,
  IconFilm,
  IconImage,
  IconList,
  IconOther,
  IconTrash,
} from "@/components/icons";

import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";

import { ITEMS_QUERY_EVENT } from "./items/query-context";
import styles from "./app-nav.module.css";

const KINDS: Array<{
  kind: string | null;
  labelKey: TranslationKey;
  Icon: typeof IconList;
}> = [
  { kind: null, labelKey: "nav.all", Icon: IconList },
  { kind: "movie", labelKey: "nav.movies", Icon: IconFilm },
  { kind: "book", labelKey: "nav.books", Icon: IconBook },
  { kind: "image", labelKey: "nav.images", Icon: IconImage },
  { kind: "other", labelKey: "nav.other", Icon: IconOther },
];

function kindFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("kind");
}

export function AppNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const [activeKind, setActiveKind] = useState<string | null>(params.get("kind"));
  const onItems = pathname === "/items";

  useEffect(() => {
    setActiveKind(params.get("kind"));
  }, [params]);

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
            {t(labelKey)}
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
  );
}
