import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ItemFormScreen } from "@/components/items/item-form-screen";
import { useCatalogueSource } from "@/lib/data-source";
import type { Item } from "@/lib/types";
import { LoadingScreen } from "@/components/loading-screen";

export function ItemFormRoute({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id: string }>();
  const source = useCatalogueSource();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    source.get(id).then(setItem).catch((cause) => setError(String(cause)));
  }, [id, mode, source]);

  if (mode === "edit" && error) return <main><p>{error}</p></main>;
  if (mode === "edit" && !item) return <main><LoadingScreen /></main>;

  return <ItemFormScreen initial={item ?? undefined} itemId={mode === "edit" ? id : undefined} />;
}
