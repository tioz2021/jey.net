import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ItemList } from "@/components/items/item-list";
import { SearchBox } from "@/components/items/search-box";
import { ListSkeleton } from "@/components/skeletons";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Записи — jey.net",
};

export default function ItemsPage() {
  return (
    <main>
      <header className={styles.header}>
        <h1 className={styles.title}>Записи</h1>
        <Link className={styles.add} href="/items/new">
          Добавить запись
        </Link>
      </header>

      {/* useSearchParams needs a Suspense boundary during prerendering. */}
      <Suspense fallback={<ListSkeleton />}>
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <SearchBox />
          <ItemList />
        </div>
      </Suspense>
    </main>
  );
}
