import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { ItemFormScreen } from "@/components/items/item-form-screen";
import { useCatalogueSource } from "@/lib/data-source";
import type { Item, ItemKind } from "@/lib/types";
import { LoadingScreen } from "@/components/loading-screen";

export function ItemFormRoute({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const source = useCatalogueSource();
  const kindParam = searchParams.get("kind");
  const initialKind = (["movie", "tv", "anime", "book", "game", "image", "other"] as ItemKind[])
    .find((kind) => kind === kindParam);
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    source.get(id).then(setItem).catch((cause) => setError(String(cause)));
  }, [id, mode, source]);

  if (mode === "edit" && error) return <main><p>{error}</p></main>;
  if (mode === "edit" && !item) return <main><LoadingScreen /></main>;

  return (
    <ItemFormScreen
      initial={item ?? undefined}
      initialKind={mode === "new" ? initialKind : undefined}
      itemId={mode === "edit" ? id : undefined}
    />
  );
}
