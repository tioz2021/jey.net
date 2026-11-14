"use client";

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/lib/navigation";
import { api } from "@/lib/api";
import { KIND_KEYS } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import type { Stats } from "@/lib/types";

const KINDS = [null, "movie", "tv", "anime", "book", "game"] as const;

export function KindChips() {
  const { t } = useI18n();
  const location = useLocation();
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  const active = new URLSearchParams(location.search).get("kind");

  useEffect(() => {
    let cancelled = false;
    api.stats
      .get()
      .then((stats: Stats) => {
        if (!cancelled) setCounts(stats.by_kind);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav aria-label="Категории" className="kind-chips">
      {KINDS.map((kind) => {
        const label = kind ? t(KIND_KEYS[kind]) : t("nav.all");
        const count = kind
          ? counts[kind] ?? 0
          : KINDS.filter((entry) => entry !== null).reduce(
              (total, entry) => total + (counts[entry] ?? 0),
              0,
            );
        return (
          <AppLink
            aria-current={(kind ?? null) === active ? "page" : undefined}
            href={kind ? `/items?kind=${kind}` : "/items"}
            key={kind ?? "all"}
          >
            {label}
            <span>{count}</span>
          </AppLink>
        );
      })}
    </nav>
  );
}
