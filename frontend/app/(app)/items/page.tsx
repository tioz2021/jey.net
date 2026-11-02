import type { Metadata } from "next";
import { Suspense } from "react";

import { ItemList } from "@/components/items/item-list";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Записи — jey",
};

export default function ItemsPage() {
  return (
    <main>
      {/* useSearchParams needs a Suspense boundary during prerendering. */}
      <Suspense
        fallback={
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <Skeleton height="4rem" />
            <Skeleton height="6.5rem" />
          </div>
        }
      >
        <ItemList />
      </Suspense>
    </main>
  );
}
