import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ItemFormScreen } from "@/components/items/item-form-screen";
import { api } from "@/lib/api";
import type { Item } from "@/lib/types";

export function ItemFormRoute({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    api.items.get(id).then((response) => setItem(response.item)).catch((cause) => setError(String(cause)));
  }, [id, mode]);

  if (mode === "edit" && error) return <main><p>{error}</p></main>;
  if (mode === "edit" && !item) return <main><p>Загрузка…</p></main>;

  return <ItemFormScreen initial={item ?? undefined} itemId={mode === "edit" ? id : undefined} />;
}
