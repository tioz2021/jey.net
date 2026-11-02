import type { Metadata } from "next";
import Link from "next/link";

import { ItemList } from "@/components/items/item-list";
import { ItemsQueryProvider } from "@/components/items/query-context";
import { SearchBox } from "@/components/items/search-box";

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

  return (
    <main>
      <header className={styles.header}>
        <h1 className={styles.title}>Записи</h1>
        <Link className={styles.add} href="/items/new">
          Добавить запись
        </Link>
      </header>

      {/* The page renders dynamically, so useSearchParams needs no Suspense
          boundary here; without the fallback a category switch never collapses
          the list height. */}
      <ItemsQueryProvider initialSearch={initial.toString()}>
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <SearchBox />
          <ItemList />
        </div>
      </ItemsQueryProvider>
    </main>
  );
}
