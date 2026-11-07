import { useParams, useSearchParams } from "react-router-dom";

import { ItemDetailScreen } from "@/components/items/item-detail-screen";

export function ItemDetailRoute() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  return <ItemDetailScreen id={id} searchParams={searchParams} />;
}
