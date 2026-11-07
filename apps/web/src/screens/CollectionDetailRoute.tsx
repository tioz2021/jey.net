import { useParams } from "react-router-dom";

import { CollectionDetailScreen } from "@/components/collections/collection-detail-screen";

export function CollectionDetailRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <CollectionDetailScreen id={id} />;
}
