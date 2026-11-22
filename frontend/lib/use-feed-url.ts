"use client";

import { useCallback, useEffect, useState } from "react";

import type { FeedPeriodValue } from "@/components/social/feed-period";
import type { FeedSortValue } from "@/components/social/feed-sort";
import type { ItemKind } from "@/lib/types";

const KINDS: Array<ItemKind | null> = [null, "movie", "tv", "anime", "book", "game", "image", "other"];
const SORTS: FeedSortValue[] = ["new", "popular", "rating"];
const PERIODS: FeedPeriodValue[] = ["24h", "week", "month", "all"];

export interface FeedUrlState {
  kind: ItemKind | null;
  sort: FeedSortValue;
  period: FeedPeriodValue;
}

function read(defaultSort: FeedSortValue): FeedUrlState {
  if (typeof window === "undefined") {
    return { kind: null, sort: defaultSort, period: "all" };
  }
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("kind") as ItemKind | null;
  const sort = params.get("sort") as FeedSortValue | null;
  const period = params.get("period") as FeedPeriodValue | null;
  return {
    kind: KINDS.includes(kind) ? kind : null,
    sort: sort && SORTS.includes(sort) ? sort : defaultSort,
    period: period && PERIODS.includes(period) ? period : "all",
  };
}

/** Feed filters are shareable and survive a reload/back navigation. */
export function useFeedUrl(defaultSort: FeedSortValue) {
  const [state, setState] = useState<FeedUrlState>(() => read(defaultSort));

  useEffect(() => {
    const sync = () => setState(read(defaultSort));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [defaultSort]);

  const update = useCallback(
    (patch: Partial<FeedUrlState>) => {
      setState((current) => {
        const next = { ...current, ...patch };
        const params = new URLSearchParams(window.location.search);
        if (next.kind) params.set("kind", next.kind);
        else params.delete("kind");
        if (next.sort !== defaultSort) params.set("sort", next.sort);
        else params.delete("sort");
        if (next.period !== "all") params.set("period", next.period);
        else params.delete("period");
        const query = params.toString();
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        return next;
      });
    },
    [defaultSort],
  );

  return [state, update] as const;
}
