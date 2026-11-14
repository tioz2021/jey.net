"use client";

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/lib/navigation";
import { IconAnime, IconBook, IconFilm, IconGame, IconList, IconTrash, IconTv } from "@/components/icons";
import { api } from "@/lib/api";
import { KIND_KEYS, KIND_PLURAL_KEYS } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import type { Stats } from "@/lib/types";

const KINDS = [null, "movie", "tv", "anime", "book", "game"] as const;
const KIND_ICONS = { movie: IconFilm, tv: IconTv, anime: IconAnime, book: IconBook, game: IconGame } as const;

let cachedCounts: Partial<Record<string, number>> | null = null;

export function KindChips() {
  const { t } = useI18n();
  const location = useLocation();
  const [counts, setCounts] = useState<Partial<Record<string, number>>>(cachedCounts ?? {});
  const [trashCount, setTrashCount] = useState(0);
  const active = new URLSearchParams(location.search).get("kind");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.stats
        .get()
        .then((stats: Stats) => {
          if (!cancelled) {
            cachedCounts = stats.by_kind;
            setCounts(stats.by_kind);
          }
        })
        .catch(() => {});
      api.items
        .list({ only_deleted: true, limit: 100 })
        .then((response) => {
          if (!cancelled) setTrashCount(response.items.length);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("jey:sync-complete", load);
    window.addEventListener("jey:item-refreshed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("jey:sync-complete", load);
      window.removeEventListener("jey:item-refreshed", load);
    };
  }, []);

  return (
    <nav aria-label="Категории" className="kind-chips">
      {KINDS.map((kind) => {
        const count = kind
          ? counts[kind] ?? 0
          : KINDS.filter((entry) => entry !== null).reduce(
              (total, entry) => total + (counts[entry] ?? 0),
              0,
            );
        const label = kind
          ? t(count === 1 ? KIND_KEYS[kind] : KIND_PLURAL_KEYS[kind])
          : t("nav.all");
        const Icon = kind ? KIND_ICONS[kind] : IconList;
        return (
          <AppLink
            aria-current={(kind ?? null) === active ? "page" : undefined}
            href={kind ? `/items?kind=${kind}` : "/items"}
            key={kind ?? "all"}
          >
            <Icon size={14} />
            {label}
            <span>{count}</span>
          </AppLink>
        );
      })}
      <AppLink href="/trash">
        <IconTrash size={14} />
        {t("nav.trash")}
        <span>{trashCount}</span>
      </AppLink>
    </nav>
  );
}
