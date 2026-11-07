"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { CatalogPage, type CatalogItem } from "@/components/items/catalog-page";
import { httpClientSource } from "@/lib/client-source";
import type { ItemKind, ItemStatus } from "@/lib/types";

function countKinds(items: CatalogItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return counts;
}

/** Web host for the shared catalogue. */
export function CatalogClient() {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [searchResults, setSearchResults] = useState<CatalogItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ItemKind | null>(null);
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    httpClientSource
      .list()
      .then(setItems)
      .catch((cause) => setError(String(cause)));
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (!needle) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      httpClientSource
        .search(needle)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((cause) => {
          if (!cancelled) setError(String(cause));
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const counts = useMemo(() => countKinds(items), [items]);
  const visibleItems = useMemo(
    () =>
      (searchResults ?? items).filter(
        (item) =>
          (!kindFilter || item.kind === kindFilter) &&
          (!statusFilter || item.status === statusFilter),
      ),
    [items, searchResults, kindFilter, statusFilter],
  );

  return (
    <CatalogPage
      action=""
      counts={counts}
      covers={{}}
      displayItems={visibleItems}
      error={error}
      items={items}
      kindFilter={kindFilter}
      onCreate={() => router.push("/items/new")}
      onKindChange={setKindFilter}
      onQueryChange={setQuery}
      onReset={() => {
        setKindFilter(null);
        setStatusFilter("");
        setQuery("");
      }}
      onStatusChange={setStatusFilter}
      query={query}
      statusFilter={statusFilter}
      hrefFor={(item) => `/items/${item.id}`}
    />
  );
}
