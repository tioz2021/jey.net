import type { Metadata } from "next";
import Link from "next/link";

import { ItemList } from "@/components/items/item-list";
import { ItemsQueryProvider } from "@/components/items/query-context";
import { PageHeader } from "@/components/ui";
import { backendFetch } from "@/lib/server-api";
import type { ItemList as ItemListResponse } from "@/lib/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Записи — jey.net",
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const initial = new URLSearchParams();

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      initial.set(key, value);
    }
  }

  // The first page is rendered on the server, so entering "Записи" shows the
  // list immediately instead of an empty shell that fetches on mount.
  const search = initial.toString();
  const response = await backendFetch(`/items${search ? `?${search}` : ""}`, {
    cache: "no-store",
  });

  let initialItems: ItemListResponse["items"] = [];
  let initialCursor: string | null = null;
  let initialLoaded = false;

  if (response.ok) {
    const page = (await response.json()) as ItemListResponse;
    initialItems = page.items;
    initialCursor = page.next_cursor;
    initialLoaded = true;
  }

  return (
    <main>
      <PageHeader
        action={
          <Link className={styles.add} href="/items/new">
            Добавить запись
          </Link>
        }
        title="Записи"
      />

      {/* The page renders dynamically, so useSearchParams needs no Suspense
          boundary here; without the fallback a category switch never collapses
          the list height. */}
      <ItemsQueryProvider initialSearch={search}>
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <ItemList
            initialCursor={initialCursor}
            initialItems={initialItems}
            initialLoaded={initialLoaded}
            initialQuery={search}
          />
        </div>
      </ItemsQueryProvider>
    </main>
  );
}
