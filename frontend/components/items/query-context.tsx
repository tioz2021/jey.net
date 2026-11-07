"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

interface ItemsQueryValue {
  params: URLSearchParams;
  /** Updates the query string without an App Router navigation. */
  update: (change: (params: URLSearchParams) => void) => void;
}

const ItemsQueryContext = createContext<ItemsQueryValue | null>(null);

export const ITEMS_QUERY_EVENT = "jey:items-query";

/**
 * Query state for the catalogue.
 *
 * App Router treats a search-param change as a navigation: it re-creates the
 * page tree, the height collapses for a frame and the browser clamps the
 * scroll position to zero. Filters are therefore applied on the client and the
 * URL is updated with `replaceState` — the DOM stays mounted, the page does
 * not jump, and back/forward still work through `popstate`.
 */
export function ItemsQueryProvider({
  children,
  initialSearch,
}: {
  children: ReactNode;
  initialSearch: string;
}) {
  const [search, setSearch] = useState(initialSearch);

  // A server navigation (back link, another page) brings a new query; keep the
  // provider in step instead of serving the filters it was mounted with.
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    const sync = () => setSearch(window.location.search.replace(/^\?/, ""));

    sync();
    window.addEventListener(ITEMS_QUERY_EVENT, sync);
    window.addEventListener("popstate", sync);

    return () => {
      window.removeEventListener(ITEMS_QUERY_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const params = useMemo(() => new URLSearchParams(search), [search]);

  const update = useCallback((change: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(window.location.search);
    change(next);

    const query = next.toString();
    const base = window.location.pathname.startsWith("/spa") ? "/spa/items" : "/items";
    window.history.replaceState(null, "", query ? `${base}?${query}` : base);
    window.dispatchEvent(new Event(ITEMS_QUERY_EVENT));
  }, []);

  const value = useMemo(() => ({ params, update }), [params, update]);

  return (
    <ItemsQueryContext.Provider value={value}>
      {children}
    </ItemsQueryContext.Provider>
  );
}

export function useItemsQuery(): ItemsQueryValue {
  const context = useContext(ItemsQueryContext);

  if (!context) {
    throw new Error("useItemsQuery must be used inside ItemsQueryProvider");
  }

  return context;
}
