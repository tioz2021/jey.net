"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/locale-context";
import type { ItemKind } from "@/lib/types";

import { ITEMS_QUERY_EVENT } from "./query-context";

const KINDS = ["movie", "tv", "book", "game", "image", "other"] as const;

const LABEL_KEYS: Record<ItemKind, TranslationKey> = {
  movie: "items.add.movie",
  tv: "items.add.tv",
  book: "items.add.book",
  game: "items.add.game",
  image: "items.add.image",
  other: "items.add.other",
};

function kindFromUrl(): ItemKind | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = new URLSearchParams(window.location.search).get("kind");
  return raw && KINDS.includes(raw as (typeof KINDS)[number])
    ? (raw as ItemKind)
    : null;
}

/**
 * The catalogue filters change the query with history.replaceState, so a
 * server-rendered button would keep the old label. This client button listens
 * to the same event as the sidebar.
 */
export function AddRecordButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const [kind, setKind] = useState<ItemKind | null>(
    KINDS.includes((params.get("kind") ?? "") as (typeof KINDS)[number])
      ? (params.get("kind") as ItemKind)
      : null,
  );

  useEffect(() => {
    setKind(kindFromUrl());

    const sync = () => setKind(kindFromUrl());
    window.addEventListener(ITEMS_QUERY_EVENT, sync);
    window.addEventListener("popstate", sync);

    return () => {
      window.removeEventListener(ITEMS_QUERY_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [params, pathname]);

  const href = kind
    ? `/items/new?kind=${kind}&locked=1`
    : "/items/new";

  return (
    <Link className={className} href={href}>
      {kind ? t(LABEL_KEYS[kind]) : t("common.add")}
    </Link>
  );
}
